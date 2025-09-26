import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from '../schemas/message.schema';
import { SendMessageDto } from '../dto/send-message.dto';

@Injectable()
export class MessageService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  // Save incoming message to DB
  async saveMessage(dto: SendMessageDto) {
    const message = new this.messageModel({
      sessionId: new Types.ObjectId(dto.sessionId),
      senderId: new Types.ObjectId(dto.senderId),
      role: dto.role,
      content: dto.content,
      type: dto.type || 'text',
      mediaUrl: dto.mediaUrl,
      isRead: false,
      createdAt: new Date()
    });
    return await message.save();
  }

  // Get messages for a session, ordered by createdAt ascending
  async getMessagesForSession(sessionId: string): Promise<Message[]> {
    return this.messageModel
      .find({ sessionId: new Types.ObjectId(sessionId) })
      .sort({ createdAt: 1 })
      .exec();
  }

  // Mark all unread messages as read for a user in a session
  async markMessagesAsRead(sessionId: string, userId: string): Promise<void> {
    await this.messageModel.updateMany(
      { sessionId: new Types.ObjectId(sessionId), senderId: { $ne: new Types.ObjectId(userId) }, isRead: false },
      { $set: { isRead: true } }
    ).exec();
  }

  // Get count of unread messages for a user in all sessions
  async getUnreadCount(userId: string): Promise<number> {
    return this.messageModel.countDocuments({ senderId: { $ne: new Types.ObjectId(userId) }, isRead: false }).exec();
  }
}
