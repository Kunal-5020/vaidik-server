// src/chat/services/chat-message.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatMessage, ChatMessageDocument } from '../schemas/chat-message.schema';

@Injectable()
export class ChatMessageService {
  private readonly logger = new Logger(ChatMessageService.name);

  constructor(
    @InjectModel(ChatMessage.name) private messageModel: Model<ChatMessageDocument>
  ) {}

  private generateMessageId(): string {
    return `MSG_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
  }

  private toObjectId(id: string): Types.ObjectId {
    try {
      return new Types.ObjectId(id);
    } catch {
      throw new BadRequestException('Invalid ID format');
    }
  }

  // ===== SEND MESSAGE (Text, Image, Video, Voice Note) =====
  async sendMessage(data: {
    sessionId: string;
    senderId: string;
    senderModel: 'User' | 'Astrologer';
    receiverId: string;
    receiverModel: 'User' | 'Astrologer';
    orderId: string;
    type: string;
    content: string;
    fileUrl?: string;
    fileS3Key?: string;
    fileSize?: number;
    fileName?: string;
    fileDuration?: number;
    mimeType?: string;
    replyToId?: string;
  }): Promise<ChatMessageDocument> {
    const messageId = this.generateMessageId();

    const message = new this.messageModel({
      messageId,
      sessionId: this.toObjectId(data.sessionId),
      orderId: data.orderId,
      senderId: this.toObjectId(data.senderId),
      senderModel: data.senderModel,
      receiverId: this.toObjectId(data.receiverId),
      receiverModel: data.receiverModel,
      type: data.type,
      content: data.content,
      fileUrl: data.fileUrl,
      fileS3Key: data.fileS3Key,
      fileSize: data.fileSize,
      fileName: data.fileName,
      fileDuration: data.fileDuration,
      mimeType: data.mimeType,
      replyToId: data.replyToId,
      deleteStatus: 'visible',
      deliveryStatus: 'sending', // ✅ Start as sending
      sentAt: new Date(),
      createdAt: new Date()
    });

    await message.save();

    this.logger.log(`Message created: ${messageId} | Type: ${data.type} | Status: sending`);

    return message;
  }

  // ===== SEND KUNDLI DETAILS (Auto message) =====
  async sendKundliDetailsMessage(
    sessionId: string,
    astrologerId: string,
    userId: string,
    orderId: string,
    kundliData: {
      name: string;
      dob: string;
      birthTime: string;
      birthPlace: string;
      gender: string;
    }
  ): Promise<ChatMessageDocument> {
    const messageId = this.generateMessageId();

    const message = new this.messageModel({
      messageId,
      sessionId: this.toObjectId(sessionId),
      orderId,
      senderId: this.toObjectId(userId), // Sent by user but auto-generated
      senderModel: 'User',
      receiverId: this.toObjectId(astrologerId),
      receiverModel: 'Astrologer',
      type: 'kundli_details',
      content: `Kundli Details: ${kundliData.name}, DOB: ${kundliData.dob}, Birth Time: ${kundliData.birthTime}, Place: ${kundliData.birthPlace}, Gender: ${kundliData.gender}`,
      kundliDetails: kundliData,
      isVisibleToUser: false, // ✅ Only visible to astrologer
      isVisibleToAstrologer: true, // ✅ Visible to astrologer only
      deleteStatus: 'visible',
      deliveryStatus: 'sent',
      sentAt: new Date(),
      createdAt: new Date()
    });

    await message.save();

    this.logger.log(`Kundli details message sent: ${messageId}`);

    return message;
  }

  // ===== UPDATE DELIVERY STATUS (Sent) =====
  async markAsSent(messageIds: string[]): Promise<void> {
    await this.messageModel.updateMany(
      { messageId: { $in: messageIds } },
      {
        $set: {
          deliveryStatus: 'sent', // ✅ Grey double tick
          sentAt: new Date()
        }
      }
    );

    this.logger.log(`${messageIds.length} messages marked as sent`);
  }

  // ===== UPDATE DELIVERY STATUS (Delivered) =====
  async markAsDelivered(messageIds: string[]): Promise<void> {
    await this.messageModel.updateMany(
      { messageId: { $in: messageIds } },
      {
        $set: {
          deliveryStatus: 'delivered', // ✅ Grey double tick (delivered)
          deliveredAt: new Date()
        }
      }
    );

    this.logger.log(`${messageIds.length} messages marked as delivered`);
  }

  // ===== UPDATE DELIVERY STATUS (Read/Blue Tick) =====
  async markAsRead(messageIds: string[], userId: string): Promise<void> {
    await this.messageModel.updateMany(
      { messageId: { $in: messageIds } },
      {
        $set: {
          deliveryStatus: 'read', // ✅ Blue double tick (read)
          readAt: new Date()
        }
      }
    );

    this.logger.log(`${messageIds.length} messages marked as read by ${userId}`);
  }

  // ===== MARK MESSAGE AS STARRED =====
  async starMessage(messageId: string, userId: string): Promise<ChatMessageDocument | null> {
    const message = await this.messageModel.findOne({ messageId });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const userObjectId = this.toObjectId(userId);

    // Check if already starred by this user
    if (message.starredBy && message.starredBy.includes(userObjectId)) {
      throw new BadRequestException('Message already starred by you');
    }

    message.isStarred = true;
    if (!message.starredBy) {
      message.starredBy = [];
    }
    message.starredBy.push(userObjectId);
    message.starredAt = new Date();

    await message.save();

    this.logger.log(`Message starred: ${messageId}`);

    return message;
  }

  // ===== UNSTAR MESSAGE =====
  async unstarMessage(messageId: string, userId: string): Promise<ChatMessageDocument | null> {
    const message = await this.messageModel.findOne({ messageId });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const userObjectId = this.toObjectId(userId);

    // Remove user from starredBy array
    message.starredBy = message.starredBy?.filter(id => id.toString() !== userObjectId.toString()) || [];

    if (message.starredBy.length === 0) {
      message.isStarred = false;
      message.starredAt = undefined;
    }

    await message.save();

    this.logger.log(`Message unstarred: ${messageId}`);

    return message;
  }

  // ===== GET STARRED MESSAGES =====
  async getStarredMessages(
    sessionId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({
          sessionId: this.toObjectId(sessionId),
          isStarred: true,
          isDeleted: false
        })
        .populate('senderId', 'name profileImage profilePicture')
        .sort({ starredAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({
        sessionId: this.toObjectId(sessionId),
        isStarred: true,
        isDeleted: false
      })
    ]);

    return {
      messages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // ===== GET SESSION MESSAGES =====
  async getSessionMessages(
    sessionId: string,
    page: number = 1,
    limit: number = 50,
    userId?: string
  ): Promise<any> {
    const skip = (page - 1) * limit;

    let visibilityFilter: any = { isDeleted: false, deleteStatus: 'visible' };

    // Filter based on visibility
    if (userId) {
      visibilityFilter.$or = [
        { isVisibleToUser: true },
        { isVisibleToAstrologer: true }
      ];
    }

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({
          sessionId: this.toObjectId(sessionId),
          ...visibilityFilter
        })
        .populate('senderId', 'name profileImage profilePicture')
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({
        sessionId: this.toObjectId(sessionId),
        ...visibilityFilter
      })
    ]);

    return {
      messages: messages.reverse(),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // ===== GET UNREAD COUNT =====
  async getUnreadCount(userId: string, sessionId: string): Promise<number> {
    return this.messageModel.countDocuments({
      sessionId: this.toObjectId(sessionId),
      receiverId: this.toObjectId(userId),
      deliveryStatus: { $in: ['sending', 'sent', 'delivered'] }, // Not read
      isDeleted: false
    });
  }

  // ===== GET TOTAL UNREAD COUNT =====
  async getTotalUnreadCount(userId: string): Promise<number> {
    return this.messageModel.countDocuments({
      receiverId: this.toObjectId(userId),
      deliveryStatus: { $in: ['sending', 'sent', 'delivered'] },
      isDeleted: false
    });
  }

  // ===== ADD REACTION =====
  async addReaction(
    messageId: string,
    userId: string,
    userModel: 'User' | 'Astrologer',
    emoji: string
  ): Promise<void> {
    const message = await this.messageModel.findOne({ messageId });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check if user already reacted with this emoji
    const existingReaction = message.reactions?.find(
      r => r.userId.toString() === userId && r.emoji === emoji
    );

    if (existingReaction) {
      throw new BadRequestException('You already reacted with this emoji');
    }

    await this.messageModel.findOneAndUpdate(
      { messageId },
      {
        $push: {
          reactions: {
            userId: this.toObjectId(userId),
            emoji,
            userModel,
            addedAt: new Date()
          }
        }
      }
    );

    this.logger.log(`Reaction added to message: ${messageId} | Emoji: ${emoji}`);
  }

  // ===== REMOVE REACTION =====
  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<void> {
    await this.messageModel.findOneAndUpdate(
      { messageId },
      {
        $pull: {
          reactions: {
            userId: this.toObjectId(userId),
            emoji
          }
        }
      }
    );

    this.logger.log(`Reaction removed from message: ${messageId}`);
  }

  // ===== EDIT MESSAGE =====
  async editMessage(messageId: string, senderId: string, newContent: string): Promise<ChatMessageDocument | null> {
    const message = await this.messageModel.findOne({ messageId });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderId.toString() !== senderId) {
      throw new BadRequestException('You can only edit your own messages');
    }

    const oldContent = message.content;
    message.content = newContent;
    message.isEdited = true;
    message.editedAt = new Date();

    if (!message.editHistory) {
      message.editHistory = [];
    }

    message.editHistory.push({
      content: oldContent,
      editedAt: new Date()
    });

    await message.save();

    this.logger.log(`Message edited: ${messageId}`);

    return message;
  }

  // ===== DELETE MESSAGE =====
  async deleteMessage(
    messageId: string,
    senderId: string,
    deleteFor: 'sender' | 'everyone'
  ): Promise<void> {
    const message = await this.messageModel.findOne({ messageId });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderId.toString() !== senderId) {
      throw new BadRequestException('You can only delete your own messages');
    }

    if (deleteFor === 'everyone') {
      message.isDeleted = true;
      message.deleteStatus = 'deleted_for_everyone';
      message.deletedAt = new Date();
    } else {
      message.deleteStatus = 'deleted_for_sender';
    }

    await message.save();

    this.logger.log(`Message deleted: ${messageId} | Delete for: ${deleteFor}`);
  }

  // ===== SEARCH MESSAGES =====
  async searchMessages(
    sessionId: string,
    query: string,
    page: number = 1,
    limit: number = 50
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({
          sessionId: this.toObjectId(sessionId),
          content: { $regex: query, $options: 'i' },
          isDeleted: false
        })
        .populate('senderId', 'name profileImage')
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({
        sessionId: this.toObjectId(sessionId),
        content: { $regex: query, $options: 'i' },
        isDeleted: false
      })
    ]);

    return {
      messages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}
