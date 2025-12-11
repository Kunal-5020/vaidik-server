// src/chat/services/chat-message.service.ts (BACKEND – COMPLETE FIXED)

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatMessage, ChatMessageDocument } from '../schemas/chat-message.schema';
import { Order, OrderDocument } from '../../orders/schemas/orders.schema';

@Injectable()
export class ChatMessageService {
  private readonly logger = new Logger(ChatMessageService.name);

  constructor(
    @InjectModel(ChatMessage.name) private messageModel: Model<ChatMessageDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
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

  async sendMessage(data: {
    sessionId: string;
    senderId: string;
    senderModel: 'User' | 'Astrologer' | 'System';
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
    isCallRecording?: boolean;
    linkedSessionId?: string;
  }): Promise<ChatMessageDocument> {
    const messageId = this.generateMessageId();

    const message = new this.messageModel({
      messageId,
      sessionId: data.sessionId,
      orderId: data.orderId,
      senderId: this.toObjectId(data.senderId),
      senderModel: data.senderModel,
      receiverModel: data.receiverModel,
      receiverId: this.toObjectId(data.receiverId),
      type: data.type,
      content: data.content,
      fileUrl: data.fileUrl,
      fileS3Key: data.fileS3Key,
      fileSize: data.fileSize,
      fileName: data.fileName,
      fileDuration: data.fileDuration,
      mimeType: data.mimeType,
      replyToId: data.replyToId,
      isCallRecording: data.isCallRecording || false,
      linkedSessionId: data.linkedSessionId,
      deleteStatus: 'visible',
      deliveryStatus: data.senderModel === 'System' ? 'sent' : 'sending',
      sentAt: new Date(),
      createdAt: new Date()
    });

    await message.save();
    await this.updateConversationStats(
      data.orderId, 
      {
        content: data.content,
        type: data.type,
        sentBy: data.senderId,
        sentAt: new Date(),
        isRead: false
      }
    );

    this.logger.log(`Message created: ${messageId} | Type: ${data.type} | Thread: ${data.orderId}`);

    return message;
  }

  private async updateConversationStats(
    orderId: string, 
    lastMessage?: { content: string; type: string; sentBy: string; sentAt: Date; isRead: boolean }
  ): Promise<void> {
    try {
      const updateData: any = {
        $inc: { messageCount: 1 },
        $set: { lastInteractionAt: new Date() }
      };

      if (lastMessage) {
        updateData.$set.lastMessage = lastMessage;
      }

      await this.orderModel.findOneAndUpdate({ orderId }, updateData);
    } catch (error: any) {
      this.logger.error(`Failed to update conversation stats: ${error.message}`);
    }
  }

  async getConversationMessages(
    orderId: string,
    page: number = 1,
    limit: number = 50,
    userId?: string,
    role?: 'User' | 'Astrologer'
  ): Promise<any> {
    const skip = (page - 1) * limit;

    let visibilityFilter: any = { isDeleted: false, deleteStatus: 'visible' };

    // Apply strict visibility based on role
    if (role === 'User') {
      visibilityFilter.isVisibleToUser = true;
    } else if (role === 'Astrologer') {
      visibilityFilter.isVisibleToAstrologer = true;
    } else if (userId) {
      // Fallback: If no role specified but user exists, show if visible to EITHER
      visibilityFilter.$or = [
        { isVisibleToUser: true },
        { isVisibleToAstrologer: true }
      ];
    }

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({
          orderId: orderId,
          ...visibilityFilter
        })
        .populate('senderId', 'name profileImage profilePicture')
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({
        orderId: orderId,
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
      sessionId: sessionId,
      orderId,
      senderId: this.toObjectId(userId),
      senderModel: 'User',
      receiverId: this.toObjectId(astrologerId),
      receiverModel: 'Astrologer',
      type: 'kundli_details',
      content: `Kundli Details: ${kundliData.name}, DOB: ${kundliData.dob}, Birth Time: ${kundliData.birthTime}, Place: ${kundliData.birthPlace}, Gender: ${kundliData.gender}`,
      kundliDetails: kundliData,
      isVisibleToUser: true,
      isVisibleToAstrologer: true,
      deleteStatus: 'visible',
      deliveryStatus: 'sent',
      sentAt: new Date(),
      createdAt: new Date()
    });

    await message.save();
    this.logger.log(`Kundli details message sent: ${messageId}`);

    return message;
  }

  async markAsSent(messageIds: string[]): Promise<void> {
    await this.messageModel.updateMany(
      { messageId: { $in: messageIds } },
      {
        $set: {
          deliveryStatus: 'sent',
          sentAt: new Date()
        }
      }
    );

    this.logger.log(`${messageIds.length} messages marked as sent`);
  }

  async markAsDelivered(messageIds: string[]): Promise<void> {
    await this.messageModel.updateMany(
      { messageId: { $in: messageIds } },
      {
        $set: {
          deliveryStatus: 'delivered',
          deliveredAt: new Date()
        }
      }
    );

    this.logger.log(`${messageIds.length} messages marked as delivered`);
  }

  async markAsRead(messageIds: string[], userId: string): Promise<void> {
    await this.messageModel.updateMany(
      { messageId: { $in: messageIds } },
      {
        $set: {
          deliveryStatus: 'read',
          readAt: new Date()
        }
      }
    );

    this.logger.log(`${messageIds.length} messages marked as read by ${userId}`);
  }

  async starMessage(messageId: string, userId: string): Promise<ChatMessageDocument | null> {
    const message = await this.messageModel.findOne({ messageId });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const userObjectId = this.toObjectId(userId);

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

  async unstarMessage(messageId: string, userId: string): Promise<ChatMessageDocument | null> {
    const message = await this.messageModel.findOne({ messageId });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const userObjectId = this.toObjectId(userId);

    message.starredBy = message.starredBy?.filter(id => id.toString() !== userObjectId.toString()) || [];

    if (message.starredBy.length === 0) {
      message.isStarred = false;
      message.starredAt = undefined;
    }

    await message.save();
    this.logger.log(`Message unstarred: ${messageId}`);

    return message;
  }

  async getStarredMessages(
    sessionId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<any> {
    const skip = (page - 1) * limit;

    let sessionIdQuery: any;
    try {
      sessionIdQuery = this.toObjectId(sessionId);
    } catch {
      sessionIdQuery = sessionId;
    }

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({
          sessionId: sessionIdQuery,
          isStarred: true,
          isDeleted: false
        })
        .populate('senderId', 'name profileImage profilePicture')
        .sort({ starredAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({
        sessionId: sessionIdQuery,
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

  async getSessionMessages(
    sessionId: string,
    page: number = 1,
    limit: number = 50,
    userId?: string
  ): Promise<any> {
    const skip = (page - 1) * limit;

    let visibilityFilter: any = { isDeleted: false, deleteStatus: 'visible' };

    if (userId) {
      visibilityFilter.$or = [
        { isVisibleToUser: true },
        { isVisibleToAstrologer: true }
      ];
    }

    let sessionIdQuery: any;
    try {
      sessionIdQuery = this.toObjectId(sessionId);
    } catch {
      sessionIdQuery = sessionId;
    }

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({
          sessionId: sessionIdQuery,
          ...visibilityFilter
        })
        .populate('senderId', 'name profileImage profilePicture')
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({
        sessionId: sessionIdQuery,
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

  async getUnreadCount(userId: string, sessionId: string): Promise<number> {
    let sessionIdQuery: any;
    try {
      sessionIdQuery = this.toObjectId(sessionId);
    } catch {
      sessionIdQuery = sessionId;
    }

    return this.messageModel.countDocuments({
      sessionId: sessionIdQuery,
      receiverId: this.toObjectId(userId),
      deliveryStatus: { $in: ['sending', 'sent', 'delivered'] },
      isDeleted: false
    });
  }

  async getTotalUnreadCount(userId: string): Promise<number> {
    return this.messageModel.countDocuments({
      receiverId: this.toObjectId(userId),
      deliveryStatus: { $in: ['sending', 'sent', 'delivered'] },
      isDeleted: false
    });
  }

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

  async searchMessages(
    sessionId: string,
    query: string,
    page: number = 1,
    limit: number = 50
  ): Promise<any> {
    const skip = (page - 1) * limit;

    let sessionIdQuery: any;
    try {
      sessionIdQuery = this.toObjectId(sessionId);
    } catch {
      sessionIdQuery = sessionId;
    }

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({
          sessionId: sessionIdQuery,
          content: { $regex: query, $options: 'i' },
          isDeleted: false
        })
        .populate('senderId', 'name profileImage')
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({
        sessionId: sessionIdQuery,
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

  async getConversationStarredMessages(
    orderId: string,
    userId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const userObjectId = this.toObjectId(userId);

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({
          orderId: orderId,
          isStarred: true,
          starredBy: userObjectId,
          isDeleted: false,
          deleteStatus: 'visible',
        })
        .populate('senderId', 'name profileImage profilePicture')
        .sort({ starredAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({
        orderId: orderId,
        isStarred: true,
        starredBy: userObjectId,
        isDeleted: false,
        deleteStatus: 'visible',
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
