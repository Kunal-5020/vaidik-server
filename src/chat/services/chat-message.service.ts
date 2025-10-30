// src/chat/services/chat-message.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatMessage, ChatMessageDocument } from '../schemas/chat-message.schema';

@Injectable()
export class ChatMessageService {
  private readonly logger = new Logger(ChatMessageService.name);

  constructor(
    @InjectModel(ChatMessage.name) private messageModel: Model<ChatMessageDocument>,
  ) {}

  // Generate message ID
  private generateMessageId(): string {
    return `MSG_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
  }

  // Send message
  async sendMessage(messageData: {
    sessionId: string;
    senderId: string;
    senderModel: 'User' | 'Astrologer';
    receiverId: string;
    receiverModel: 'User' | 'Astrologer';
    type: string;
    content: string;
    fileUrl?: string;
    fileS3Key?: string;
    fileSize?: number;
    fileName?: string;
    thumbnailUrl?: string;
    duration?: number;
    replyTo?: string; // ✅ NEW
    quotedMessage?: any; // ✅ NEW
  }): Promise<ChatMessageDocument> {
    const messageId = this.generateMessageId();

    const message = new this.messageModel({
      messageId,
      ...messageData,
      deliveryStatus: 'sent',
      isRead: false,
      isDeleted: false,
      sentAt: new Date(),
      reactions: [],
      starredBy: []
    });

    await message.save();

    this.logger.log(`Message sent: ${messageId} | Session: ${messageData.sessionId}`);

    return message;
  }

  // ✅ NEW: Mark as delivered
  async markAsDelivered(messageIds: string[]): Promise<void> {
    await this.messageModel.updateMany(
      {
        messageId: { $in: messageIds },
        deliveryStatus: 'sent'
      },
      {
        $set: {
          deliveryStatus: 'delivered',
          deliveredAt: new Date()
        }
      }
    );
  }

  // Mark as read
  async markAsRead(messageIds: string[], userId: string): Promise<void> {
    await this.messageModel.updateMany(
      {
        messageId: { $in: messageIds },
        receiverId: userId,
        isRead: false
      },
      {
        $set: {
          deliveryStatus: 'read',
          isRead: true,
          readAt: new Date()
        }
      }
    );
  }

  // ✅ NEW: Add reaction (WhatsApp style)
  async addReaction(
  messageId: string,
  userId: string,
  userModel: 'User' | 'Astrologer',
  emoji: string
): Promise<ChatMessageDocument> {
  const message = await this.messageModel.findOne({ messageId });
  if (!message) {
    throw new NotFoundException('Message not found');
  }

  // ✅ Initialize reactions if undefined
  if (!message.reactions) {
    message.reactions = [];
  }

  // Remove existing reaction from this user
  message.reactions = message.reactions.filter(
    (r: any) => r.userId.toString() !== userId
  );

  // Add new reaction
  message.reactions.push({
    userId: new Types.ObjectId(userId),
    userModel,
    emoji,
    reactedAt: new Date()
  } as any);

  await message.save();
  return message;
}

  // ✅ NEW: Remove reaction
  async removeReaction(messageId: string, userId: string): Promise<void> {
    await this.messageModel.updateOne(
      { messageId },
      {
        $pull: {
          reactions: { userId: new Types.ObjectId(userId) }
        }
      }
    );
  }

  // ✅ NEW: Star/Unstar message
  async toggleStar(messageId: string, userId: string): Promise<boolean> {
  const message = await this.messageModel.findOne({ messageId });
  if (!message) {
    throw new NotFoundException('Message not found');
  }

  // ✅ Initialize starredBy if undefined
  if (!message.starredBy) {
    message.starredBy = [];
  }

  const userObjectId = new Types.ObjectId(userId);
  const isStarred = message.starredBy.some((id: any) => id.toString() === userId);

  if (isStarred) {
    message.starredBy = message.starredBy.filter((id: any) => id.toString() !== userId);
  } else {
    message.starredBy.push(userObjectId);
  }

  await message.save();
  return !isStarred;
}

  // ✅ NEW: Get starred messages
  async getStarredMessages(userId: string, sessionId: string): Promise<ChatMessageDocument[]> {
    return this.messageModel
      .find({
        sessionId,
        starredBy: userId,
        isDeleted: false
      })
      .sort({ sentAt: -1 })
      .lean();
  }

  // ✅ NEW: Edit message
  async editMessage(
  messageId: string,
  senderId: string,
  newContent: string
): Promise<ChatMessageDocument> {
  const message = await this.messageModel.findOne({ messageId, senderId });
  if (!message) {
    throw new NotFoundException('Message not found');
  }

  if (message.type !== 'text') {
    throw new BadRequestException('Only text messages can be edited');
  }

  message.content = newContent;
  (message as any).isEdited = true;
  (message as any).editedAt = new Date();

  await message.save();
  return message;
}

  // Delete message
  async deleteMessage(
  messageId: string,
  senderId: string,
  deleteFor: 'sender' | 'everyone' = 'sender'
): Promise<void> {
  const message = await this.messageModel.findOne({ messageId, senderId });
  if (!message) {
    throw new NotFoundException('Message not found');
  }

  message.isDeleted = true;
  message.deletedAt = new Date();
  (message as any).deletedFor = deleteFor;

  if (deleteFor === 'everyone') {
    message.content = 'This message was deleted';
  }

  await message.save();
}

  // ✅ NEW: Forward message
  async forwardMessage(
  originalMessageId: string,
  targetSessionId: string,
  senderId: string,
  senderModel: 'User' | 'Astrologer',
  receiverId: string,
  receiverModel: 'User' | 'Astrologer'
): Promise<ChatMessageDocument> {
  const originalMessage = await this.messageModel.findOne({ messageId: originalMessageId });
  if (!originalMessage) {
    throw new NotFoundException('Original message not found');
  }

  const forwardedMessage = await this.sendMessage({
    sessionId: targetSessionId,
    senderId,
    senderModel,
    receiverId,
    receiverModel,
    type: originalMessage.type,
    content: originalMessage.content,
    fileUrl: originalMessage.fileUrl,
    fileS3Key: originalMessage.fileS3Key,
    fileSize: originalMessage.fileSize,
    fileName: originalMessage.fileName,
    thumbnailUrl: (originalMessage as any).thumbnailUrl,
    duration: (originalMessage as any).duration
  });

  (forwardedMessage as any).isForwarded = true;
  (forwardedMessage as any).originalMessageId = originalMessageId;
  await forwardedMessage.save();

  return forwardedMessage;
}

  // Get session messages
  async getSessionMessages(
    sessionId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({ sessionId, isDeleted: false })
        .populate('replyTo', 'messageId content type senderId')
        .sort({ sentAt: -1 }) // ✅ Descending for pagination (latest first)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({ sessionId, isDeleted: false })
    ]);

    return {
      messages: messages.reverse(), // ✅ Reverse for chronological order in UI
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: page < Math.ceil(total / limit)
      }
    };
  }

  // Get unread count
  async getUnreadCount(userId: string, sessionId: string): Promise<number> {
    return this.messageModel.countDocuments({
      sessionId,
      receiverId: userId,
      isRead: false,
      isDeleted: false
    });
  }

  // ✅ NEW: Get total unread count across all sessions
  async getTotalUnreadCount(userId: string): Promise<number> {
    return this.messageModel.countDocuments({
      receiverId: userId,
      isRead: false,
      isDeleted: false
    });
  }

  // ✅ NEW: Search messages
  async searchMessages(sessionId: string, query: string): Promise<ChatMessageDocument[]> {
    return this.messageModel
      .find({
        sessionId,
        type: 'text',
        content: { $regex: query, $options: 'i' },
        isDeleted: false
      })
      .sort({ sentAt: -1 })
      .limit(50)
      .lean();
  }
}
