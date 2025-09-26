import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CallSession, CallSessionDocument } from './schemas/call-session.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../astrologers/schemas/astrologer.schema';
import { AgoraService, CallChannelInfo } from './services/agora.service';
import { InitiateCallDto } from './dto/initiate-call.dto';
import { JoinCallDto } from './dto/join-call.dto';
import { EndCallDto } from './dto/end-call.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    @InjectModel(CallSession.name) private callSessionModel: Model<CallSessionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private agoraService: AgoraService,
  ) {}

  // Initiate a new call
  async initiateCall(userId: string, initiateCallDto: InitiateCallDto): Promise<any> {
    // Validate user exists and has sufficient balance
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user has enough balance for at least 1 minute
    if (user.wallet.balance < initiateCallDto.ratePerMinute) {
      throw new BadRequestException('Insufficient wallet balance for this call');
    }

    // Validate astrologer exists and is available
    const astrologer = await this.astrologerModel.findById(initiateCallDto.astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    if (astrologer.status !== 'online') {
      throw new BadRequestException('Astrologer is not available for calls');
    }

    // Check if astrologer has calls enabled
    const callEnabled = initiateCallDto.callType === 'audio' 
      ? astrologer.isCallEnabled 
      : astrologer.isCallEnabled; // You might want separate video call flag

    if (!callEnabled) {
      throw new BadRequestException(`Astrologer has ${initiateCallDto.callType} calls disabled`);
    }

    try {
      // Create Agora channel
      const channelInfo: CallChannelInfo = this.agoraService.createCallChannel(
        userId, 
        initiateCallDto.astrologerId
      );

      // Generate unique call ID
      const callId = uuidv4();

      // Create call session in database
      const callSession = new this.callSessionModel({
        userId: new Types.ObjectId(userId),
        astrologerId: new Types.ObjectId(initiateCallDto.astrologerId),
        callId,
        callType: initiateCallDto.callType,
        channelName: channelInfo.channelName,
        userUid: channelInfo.userUid,
        astrologerUid: channelInfo.astrologerUid,
        ratePerMinute: initiateCallDto.ratePerMinute,
        status: 'initiated',
        participants: {
          userJoined: false,
          astrologerJoined: false,
          userLeft: false,
          astrologerLeft: false
        }
      });

      await callSession.save();

      this.logger.log(`📞 Call initiated: ${callId} between user ${userId} and astrologer ${initiateCallDto.astrologerId}`);

      return {
        success: true,
        message: 'Call initiated successfully',
        data: {
          callId,
          callType: initiateCallDto.callType,
          channelName: channelInfo.channelName,
          userToken: channelInfo.userToken,
          userUid: channelInfo.userUid,
          appId: channelInfo.appId,
          astrologerName: astrologer.name,
          ratePerMinute: initiateCallDto.ratePerMinute,
          status: 'initiated'
        }
      };

    } catch (error) {
      this.logger.error(`❌ Call initiation failed: ${error.message}`);
      throw new BadRequestException('Failed to initiate call. Please try again.');
    }
  }

  // Join an existing call
  async joinCall(userId: string, joinCallDto: JoinCallDto): Promise<any> {
    const callSession = await this.callSessionModel
      .findOne({ callId: joinCallDto.callId })
      .populate('userId', 'name profileImage')
      .populate('astrologerId', 'name profileImage');

    if (!callSession) {
      throw new NotFoundException('Call session not found');
    }

    // Check if user is authorized to join this call
    const userIdStr = callSession.userId.toString();
    const astrologerIdStr = callSession.astrologerId.toString();

    if (userId !== userIdStr && userId !== astrologerIdStr) {
      throw new BadRequestException('You are not authorized to join this call');
    }

    // Check call status
    if (callSession.status === 'ended' || callSession.status === 'declined') {
      throw new BadRequestException('This call has already ended');
    }

    try {
      // Generate appropriate token
      const isUser = userId === userIdStr;
      const uid = isUser ? callSession.userUid : callSession.astrologerUid;
      
      const tokenResponse = this.agoraService.generateRtcToken(
        callSession.channelName,
        uid,
        'publisher'
      );

      // Update participant status
      if (isUser) {
        callSession.participants.userJoined = true;
      } else {
        callSession.participants.astrologerJoined = true;
      }

      // If astrologer is joining, mark call as connected
      if (!isUser && callSession.status === 'ringing') {
        callSession.status = 'connected';
        callSession.startedAt = new Date();
        callSession.answeredAt = new Date();
      }

      await callSession.save();

      this.logger.log(`👥 User ${userId} joined call: ${joinCallDto.callId}`);

      return {
        success: true,
        message: 'Joined call successfully',
        data: {
          callId: joinCallDto.callId,
          channelName: callSession.channelName,
          token: tokenResponse.token,
          uid,
          appId: tokenResponse.appId,
          callType: callSession.callType,
          status: callSession.status,
          participants: callSession.participants,
          ratePerMinute: callSession.ratePerMinute
        }
      };

    } catch (error) {
      this.logger.error(`❌ Join call failed: ${error.message}`);
      throw new BadRequestException('Failed to join call. Please try again.');
    }
  }

  // End a call
  async endCall(userId: string, endCallDto: EndCallDto): Promise<any> {
    const callSession = await this.callSessionModel.findOne({ callId: endCallDto.callId });

    if (!callSession) {
      throw new NotFoundException('Call session not found');
    }

    // Check authorization
    const userIdStr = callSession.userId.toString();
    const astrologerIdStr = callSession.astrologerId.toString();

    if (userId !== userIdStr && userId !== astrologerIdStr) {
      throw new BadRequestException('You are not authorized to end this call');
    }

    if (callSession.status === 'ended') {
      throw new BadRequestException('Call has already ended');
    }

    try {
      // Update call session
      callSession.status = 'ended';
      callSession.endedAt = new Date();
      callSession.endReason = endCallDto.endReason || 'completed';

      // Calculate duration and billing
      if (callSession.startedAt) {
        const durationMs = callSession.endedAt.getTime() - callSession.startedAt.getTime();
        callSession.duration = Math.floor(durationMs / 1000); // Convert to seconds

        // Calculate billing (per minute, minimum 1 minute)
        const durationMinutes = Math.max(1, Math.ceil(callSession.duration / 60));
        callSession.totalAmount = durationMinutes * callSession.ratePerMinute;

        // Deduct from user wallet and add to astrologer earnings
        await this.processBilling(callSession);
      }

      await callSession.save();

      this.logger.log(`📞 Call ended: ${endCallDto.callId}, Duration: ${callSession.duration}s`);

      return {
        success: true,
        message: 'Call ended successfully',
        data: {
          callId: endCallDto.callId,
          duration: callSession.duration,
          totalAmount: callSession.totalAmount,
          endReason: callSession.endReason,
          status: 'ended'
        }
      };

    } catch (error) {
      this.logger.error(`❌ End call failed: ${error.message}`);
      throw new BadRequestException('Failed to end call. Please try again.');
    }
  }

  // Get call history for user
  async getCallHistory(userId: string, page: number = 1, limit: number = 10): Promise<any> {
    const skip = (page - 1) * limit;

    const calls = await this.callSessionModel
      .find({
        $or: [
          { userId: new Types.ObjectId(userId) },
          { astrologerId: new Types.ObjectId(userId) }
        ]
      })
      .populate('userId', 'name profileImage')
      .populate('astrologerId', 'name profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCalls = await this.callSessionModel.countDocuments({
      $or: [
        { userId: new Types.ObjectId(userId) },
        { astrologerId: new Types.ObjectId(userId) }
      ]
    });

    return {
      success: true,
      data: {
        calls,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCalls / limit),
          totalCalls,
          hasNextPage: page < Math.ceil(totalCalls / limit),
          hasPrevPage: page > 1
        }
      }
    };
  }

  // Get active call for user
  async getActiveCall(userId: string): Promise<any> {
    const activeCall = await this.callSessionModel
      .findOne({
        $or: [
          { userId: new Types.ObjectId(userId) },
          { astrologerId: new Types.ObjectId(userId) }
        ],
        status: { $in: ['initiated', 'ringing', 'connected'] }
      })
      .populate('userId', 'name profileImage')
      .populate('astrologerId', 'name profileImage');

    if (!activeCall) {
      return {
        success: true,
        data: null,
        message: 'No active call found'
      };
    }

    return {
      success: true,
      data: activeCall
    };
  }

  // Private method to process billing
  private async processBilling(callSession: CallSessionDocument): Promise<void> {
    try {
      // Get user and astrologer
      const user = await this.userModel.findById(callSession.userId);
      const astrologer = await this.astrologerModel.findById(callSession.astrologerId);

      if (!user || !astrologer) {
        throw new Error('User or astrologer not found for billing');
      }

      // Deduct from user wallet
      if (user.wallet.balance >= callSession.totalAmount) {
        user.wallet.balance -= callSession.totalAmount;
        user.wallet.totalSpent += callSession.totalAmount;
        user.wallet.lastTransactionAt = new Date();

        // Add transaction record
        const transactionId = uuidv4();
        user.walletTransactions.push({
          transactionId,
          type: 'deduction',
          amount: -callSession.totalAmount,
          description: `${callSession.callType} call with ${astrologer.name} for ${Math.ceil(callSession.duration / 60)} minutes`,
          orderId: callSession.callId,
          balanceAfter: user.wallet.balance,
          createdAt: new Date()
        } as any);

        await user.save();
      }

      // Add to astrologer earnings (after platform commission)
      const platformCommission = astrologer.earnings.platformCommission || 20;
      const astrologerEarning = callSession.totalAmount * (100 - platformCommission) / 100;

      astrologer.stats.totalEarnings += astrologerEarning;
      astrologer.stats.totalMinutes += Math.ceil(callSession.duration / 60);
      astrologer.stats.totalOrders += 1;
      astrologer.stats.callOrders += 1;

      astrologer.earnings.totalEarned += astrologerEarning;
      astrologer.earnings.withdrawableAmount += astrologerEarning;

      await astrologer.save();

      this.logger.log(`💰 Billing processed for call ${callSession.callId}: ₹${callSession.totalAmount}`);

    } catch (error) {
      this.logger.error(`❌ Billing failed for call ${callSession.callId}: ${error.message}`);
    }
  }

  // Renew Agora token
  async renewToken(callId: string, userId: string): Promise<any> {
    const callSession = await this.callSessionModel.findOne({ callId });

    if (!callSession) {
      throw new NotFoundException('Call session not found');
    }

    const userIdStr = callSession.userId.toString();
    const astrologerIdStr = callSession.astrologerId.toString();

    if (userId !== userIdStr && userId !== astrologerIdStr) {
      throw new BadRequestException('You are not authorized to renew token for this call');
    }

    const isUser = userId === userIdStr;
    const uid = isUser ? callSession.userUid : callSession.astrologerUid;

    const tokenResponse = this.agoraService.renewToken(callSession.channelName, uid);

    return {
      success: true,
      data: {
        token: tokenResponse.token,
        channelName: tokenResponse.channelName,
        uid: tokenResponse.uid
      }
    };
  }

  // Get Agora configuration
  getAgoraConfig(): any {
    return this.agoraService.getAppConfig();
  }
}
