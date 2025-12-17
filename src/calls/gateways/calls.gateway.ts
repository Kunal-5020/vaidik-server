// src/calls/gateways/calls.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, BadRequestException } from '@nestjs/common';
import { CallSessionService } from '../services/call-session.service';
import { CallRecordingService } from '../services/call-recording.service';
import { AgoraService } from '../services/agora.service';
import { CallBillingService } from '../services/call-billing.service';
import { forwardRef, Inject } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/calls',
})
export class CallGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(CallGateway.name);
  private activeUsers = new Map<string, { socketId: string; userId: string; role: string; sessionId?: string }>();
  private sessionTimers = new Map<string, NodeJS.Timeout>();
  private astrologerSockets = new Map<string, string>();
  private activeRecordings = new Map<string, string>();
  
  // ✅ LOCK: Prevent double processing of end call
  private processingEndCall = new Set<string>();

  constructor(
    @Inject(forwardRef(() => CallSessionService))
    private callSessionService: CallSessionService,
    private callRecordingService: CallRecordingService,
    private agoraService: AgoraService,
    private callBillingService: CallBillingService
  ) {}

  async handleConnection(client: Socket) { this.logger.log(`Call client connected: ${client.id}`); }
  async handleDisconnect(client: Socket) {
    this.logger.log(`Call client disconnected: ${client.id}`);
    for (const [userId, userData] of this.activeUsers.entries()) {
      if (userData.socketId === client.id) {
        if (userData.sessionId) {
          this.callSessionService.updateParticipantStatus(
            userData.sessionId, userId, userData.role as 'user' | 'astrologer',
            { isOnline: false, connectionQuality: 'offline' }
          ).catch(e => {});
          client.to(userData.sessionId).emit('participant_disconnected', { userId, role: userData.role });
        }
        this.activeUsers.delete(userId);
        if (userData.role === 'astrologer') this.astrologerSockets.delete(userId);
        break;
      }
    }
  }

  @SubscribeMessage('register_astrologer')
  handleRegisterAstrologer(@ConnectedSocket() client: Socket, @MessageBody() data: { astrologerId: string }) {
    this.astrologerSockets.set(data.astrologerId, client.id);
    return { success: true };
  }

  @SubscribeMessage('initiate_call')
  async handleInitiateCall(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    try {
      const result = await this.callSessionService.initiateCall({
        userId: data.userId,
        astrologerId: data.astrologerId,
        astrologerName: data.astrologerName,
        callType: data.callType,
        ratePerMinute: data.ratePerMinute
      });
      const astroSocketId = this.astrologerSockets.get(data.astrologerId);
      const payload = {
        sessionId: result.data.sessionId,
        orderId: result.data.orderId,
        userId: data.userId,
        callType: data.callType,
        ratePerMinute: data.ratePerMinute,
        requestExpiresIn: 180000,
        timestamp: new Date(),
      };
      if (astroSocketId) this.server.to(astroSocketId).emit('incoming_call', payload);
      else this.server.emit('incoming_call_to_astrologer', { astrologerId: data.astrologerId, ...payload });
      return result;
    } catch (error: any) { return { success: false, message: error.message }; }
  }

  @SubscribeMessage('accept_call')
  async handleAcceptCall(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    try {
      const result = await this.callSessionService.acceptCall(data.sessionId, data.astrologerId);
      const userData = Array.from(this.activeUsers.values()).find(u => u.sessionId === data.sessionId);
      if (userData) this.server.to(userData.socketId).emit('call_accepted', { sessionId: data.sessionId, astrologerId: data.astrologerId });
      return result;
    } catch (error: any) { return { success: false, message: error.message }; }
  }

  @SubscribeMessage('reject_call')
  async handleRejectCall(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    try {
      const result = await this.callSessionService.rejectCall(data.sessionId, data.astrologerId, data.reason || 'rejected');
      const userData = Array.from(this.activeUsers.values()).find(u => u.sessionId === data.sessionId);
      if (userData) this.server.to(userData.socketId).emit('call_rejected', { sessionId: data.sessionId, reason: data.reason });
      return result;
    } catch (error: any) { return { success: false, message: error.message }; }
  }

  @SubscribeMessage('join_session')
  async handleJoinSession(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    const data = Array.isArray(payload) ? payload[0] : payload;
    if (!data?.sessionId) return { success: false, message: 'Missing data' };

    client.join(data.sessionId);
    this.activeUsers.set(data.userId, { socketId: client.id, userId: data.userId, role: data.role, sessionId: data.sessionId });
    this.logger.log(`👥 ${data.role} joined call room: ${data.sessionId}`);
    client.to(data.sessionId).emit('participant_joined', { userId: data.userId, role: data.role, isOnline: true });

    await this.checkAndStartSession(data.sessionId);
    return { success: true };
  }

  private async checkAndStartSession(sessionId: string) {
    const participants = Array.from(this.activeUsers.values()).filter(u => u.sessionId === sessionId);
    const hasUser = participants.some(u => u.role === 'user');
    const hasAstrologer = participants.some(u => u.role === 'astrologer');

    if (hasUser && hasAstrologer) {
      if (this.sessionTimers.has(sessionId)) return;
      this.logger.log(`🚀 Both parties present in ${sessionId}. Auto-starting call...`);
      await this.startCallInternal(sessionId);
    }
  }

  private async startCallInternal(sessionId: string) {
    try {
      const session = await this.callSessionService.getSession(sessionId);
      if (!session) throw new BadRequestException('Session not found');

      if (!session.agoraChannelName) {
        session.agoraChannelName = this.agoraService.generateChannelName();
        await session.save();
      }

      if (session.status === 'active') {
         this.logger.log(`Call ${sessionId} already active, resuming ticker...`);
         if (!this.sessionTimers.has(sessionId)) {
            this.startTimerTicker(sessionId, session.maxDurationSeconds);
         }
         return;
      }

      const result = await this.callSessionService.startSession(sessionId);

      const channelName = session.agoraChannelName;
      const userUid = this.agoraService.generateUid();
      const astrologerUid = this.agoraService.generateUid();
      const userToken = this.agoraService.generateRtcToken(channelName, userUid, 'publisher');
      const astrologerToken = this.agoraService.generateRtcToken(channelName, astrologerUid, 'publisher');

      session.agoraUserToken = userToken;
      session.agoraAstrologerToken = astrologerToken;
      session.agoraUserUid = userUid;
      session.agoraAstrologerUid = astrologerUid;
      session.recordingStarted = new Date();
      await session.save();

      let recordingStarted = false;
      try {
        const recordingUid = this.agoraService.generateUid();
        const recordingResult = await this.callRecordingService.startRecording(
          sessionId,
          session.callType as 'audio' | 'video',
          channelName,
          recordingUid,
        );
        this.activeRecordings.set(sessionId, recordingResult.recordingId);
        recordingStarted = true;
      } catch (recErr) {
        this.logger.error(`Recording failed: ${recErr}`);
      }

      const basePayload = {
        sessionId: sessionId,
        maxDurationMinutes: result.data.maxDurationMinutes,
        maxDurationSeconds: result.data.maxDurationSeconds,
        ratePerMinute: result.data.ratePerMinute,
        callType: result.data.callType,
        chargingStarted: true,
        agoraAppId: this.agoraService.getAppId(),
        agoraChannelName: channelName,
        recordingStarted,
        timestamp: new Date().toISOString(),
      };

      const userSocket = Array.from(this.activeUsers.values()).find(u => u.role === 'user' && u.sessionId === sessionId);
      if (userSocket) this.server.to(userSocket.socketId).emit('timer_start', { ...basePayload, agoraToken: userToken, agoraUid: userUid });

      const astroSocket = Array.from(this.activeUsers.values()).find(u => u.role === 'astrologer' && u.sessionId === sessionId);
      if (astroSocket) this.server.to(astroSocket.socketId).emit('timer_start', { ...basePayload, agoraToken: astrologerToken, agoraUid: astrologerUid });

      this.startTimerTicker(sessionId, result.data.maxDurationSeconds);

    } catch (error) {
      this.logger.error(`Start call internal error: ${error.message}`);
    }
  }

  private stopSessionTimer(sessionId: string) {
    if (this.sessionTimers.has(sessionId)) {
      clearInterval(this.sessionTimers.get(sessionId)!);
      this.sessionTimers.delete(sessionId);
    }
  }

  private startTimerTicker(sessionId: string, maxDurationSeconds: number) {
    let secondsElapsed = 0;
    this.stopSessionTimer(sessionId);

    const ticker = setInterval(async () => {
      secondsElapsed++;
      const remainingSeconds = Math.max(0, maxDurationSeconds - secondsElapsed);

      if (secondsElapsed >= maxDurationSeconds) {
        this.stopSessionTimer(sessionId);
        await this.endCallInternal(sessionId, 'system', 'timeout');
        return;
      }

      this.server.to(sessionId).emit('timer_tick', { elapsedSeconds: secondsElapsed, remainingSeconds, maxDuration: maxDurationSeconds });
      
      if (remainingSeconds === 60) {
        this.server.to(sessionId).emit('timer_warning', { message: '1 minute remaining', remainingSeconds: 60 });
      }
    }, 1000);

    this.sessionTimers.set(sessionId, ticker);
  }

  @SubscribeMessage('end_call')
  async handleEndCall(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string; endedBy: string; reason: string }) {
    return await this.endCallInternal(data.sessionId, data.endedBy, data.reason);
  }

  private async endCallInternal(sessionId: string, endedBy: string, reason: string): Promise<any> {
    if (this.processingEndCall.has(sessionId)) return { success: true };
    this.processingEndCall.add(sessionId);

    try {
      this.stopSessionTimer(sessionId);
      
      // 1. Trigger Recording Stop in BACKGROUND (Fire-and-Forget)
      if (this.activeRecordings.has(sessionId)) {
         this.handleBackgroundRecordingStop(sessionId);
         this.activeRecordings.delete(sessionId);
      }

      // 2. End Session IMMEDIATELY (Don't wait for recording)
      const result = await this.callSessionService.endSession(
        sessionId,
        endedBy,
        reason,
        undefined, 
        undefined, 
        0
      );

      const billedMinutes = result.data?.billedMinutes ?? 0;
      const totalAmount = result.data?.chargeAmount ?? 0;

      this.server.to(sessionId).emit('call_ended', {
        sessionId: sessionId,
        endedBy: endedBy,
        endTime: new Date(),
        actualDuration: result.data?.actualDuration || 0,
        billedMinutes: billedMinutes,
        chargeAmount: totalAmount,
        message: 'Call ended',
        billing: { totalAmount, billedMinutes }
      });

      return { success: true, message: 'Call ended', data: result.data };

    } catch (error) {
      this.logger.error(`Error in endCallInternal: ${error.message}`);
      return { success: false, message: error.message };
    } finally {
      this.processingEndCall.delete(sessionId);
    }
  }

  // ✅ BACKGROUND TASK
  private async handleBackgroundRecordingStop(sessionId: string) {
      try {
          const session = await this.callSessionService.getSession(sessionId);
          if (!session) return;

          const recResult = await this.callRecordingService.stopRecording(
              sessionId, 
              session.agoraChannelName || ''
          );

          if (recResult.recordingUrl) {
              await this.callSessionService.updateRecordingAfterEnd(
                  sessionId,
                  recResult.recordingUrl,
                  recResult.recordingS3Key,
                  recResult.recordingDuration
              );
          }
      } catch (e) {
          this.logger.error(`Background recording stop failed for ${sessionId}: ${e.message}`);
      }
  }

  public async terminateCall(sessionId: string, endedBy: string, reason: string) {
    return this.endCallInternal(sessionId, endedBy, reason);
  }

  public async cancelCallRequest(sessionId: string, userId: string, reason: string) {
    const result = await this.callSessionService.cancelCall(sessionId, userId, reason, 'user');
    this.server.to(sessionId).emit('call_cancelled', { sessionId, reason });
    return result;
  }

  public async notifyUserOfAcceptance(sessionId: string, astrologerId: string) {
    const userData = Array.from(this.activeUsers.values()).find(u => u.sessionId === sessionId && u.role === 'user');
    if (userData) {
      this.server.to(userData.socketId).emit('call_accepted', { sessionId, astrologerId });
      this.logger.log(`Notify User: Call accepted for ${sessionId}`);
    }
  }

  public async rejectCall(sessionId: string, astrologerId: string, reason: string) {
    const result = await this.callSessionService.rejectCall(sessionId, astrologerId, reason);
    const userData = Array.from(this.activeUsers.values()).find(u => u.sessionId === sessionId && u.role === 'user');
    if (userData) {
      this.server.to(userData.socketId).emit('call_rejected', { sessionId, reason });
    }
    return result;
  }
  
}