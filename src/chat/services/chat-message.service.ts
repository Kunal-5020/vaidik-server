import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatMessage, ChatMessageDocument } from '../schemas/chat-message.schema';

@Injectable()
export class ChatMessageService {
  constructor(
    @InjectModel(ChatMessage.name) private messageModel: Model<ChatMessageDocument>,
  ) {}

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
  }): Promise<ChatMessageDocument> {
    const messageId = `MSG_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    const message = new this.messageModel({
      messageId,
      ...messageData,
      isRead: false,
      isDeleted: false,
      sentAt: new Date()
    });

    await message.save();
    return message;
  }

  async getSessionMessages(
    sessionId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({ sessionId, isDeleted: false })
        .sort({ sentAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({ sessionId, isDeleted: false })
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

  async markAsRead(messageIds: string[], userId: string): Promise<void> {
    await this.messageModel.updateMany(
      {
        messageId: { $in: messageIds },
        receiverId: userId,
        isRead: false
      },
      {
        $set: {
          isRead: true,
          readAt: new Date()
        }
      }
    );
  }

  async deleteMessage(messageId: string, senderId: string): Promise<void> {
    const message = await this.messageModel.findOne({ messageId, senderId });
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();
  }

  async getUnreadCount(userId: string, sessionId: string): Promise<number> {
    return this.messageModel.countDocuments({
      sessionId,
      receiverId: userId,
      isRead: false,
      isDeleted: false
    });
  }
}
