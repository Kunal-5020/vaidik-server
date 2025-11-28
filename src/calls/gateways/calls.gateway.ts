// src/calls/gateways/call.gateway.ts

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
import { AgoraService } from '../services/agora.service'; // ✅ ADD
import { CallBillingService } from '../services/call-billing.service';

// Shared shape for incoming call requests (audio + video)
export interface IncomingCallRequestPayload {
  sessionId: string;
  orderId: string;
  userId: string;
  callType: 'audio' | 'video';
  ratePerMinute: number;
  requestExpiresIn: number; // e.g. 3 * 60 * 1000
  sound?: string;
  vibration?: boolean;
  timestamp?: Date;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/calls',
})
export class CallGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CallGateway.name);
  private activeUsers = new Map<string, { socketId: string; userId: string; role: string; sessionId?: string }>();
  private sessionTimers = new Map<string, NodeJS.Timeout>();
  private astrologerSockets = new Map<string, string>();
  private activeRecordings = new Map<string, string>(); // sessionId → recordingId

  constructor(
    private callSessionService: CallSessionService,
    private callRecordingService: CallRecordingService,
    private agoraService: AgoraService,
    private callBillingService: CallBillingService
  ) {}

  private async ensureActiveCall(sessionId: string): Promise<boolean> {
  const session = await this.callSessionService.getSession(sessionId);
  if (!session || session.status !== 'active') {
    this.logger.warn(
      `🚫 Call action blocked; session not active: session=${sessionId}, status=${session?.status}`,
    );
    return false;
  }
  return true;
}

  handleConnection(client: Socket) {
    this.logger.log(`Call client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Call client disconnected: ${client.id}`);

    for (const [userId, userData] of this.activeUsers.entries()) {
      if (userData.socketId === client.id) {
        if (userData.sessionId) {
          this.callSessionService.updateParticipantStatus(
            userData.sessionId,
            userId,
            userData.role as 'user' | 'astrologer',
            { isOnline: false, connectionQuality: 'offline' }
          ).catch(err => this.logger.error(`Update status error: ${err.message}`));

          client.to(userData.sessionId).emit('participant_disconnected', {
            userId,
            role: userData.role,
            timestamp: new Date()
          });
        }

        this.activeUsers.delete(userId);
        if (userData.role === 'astrologer') {
          this.astrologerSockets.delete(userId);
        }
        break;
      }
    }
  }

  // ===== REGISTER ASTROLOGER =====
  @SubscribeMessage('register_astrologer')
  handleRegisterAstrologer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { astrologerId: string }
  ) {
    this.astrologerSockets.set(data.astrologerId, client.id);
    this.logger.log(`Astrologer registered: ${data.astrologerId}`);
    return { success: true };
  }

  // ===== INITIATE CALL =====
  @SubscribeMessage('initiate_call')
  async handleInitiateCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      astrologerId: string;
      astrologerName: string;
      callType: 'audio' | 'video';
      ratePerMinute: number;
      userId: string;
    }
  ) {
    try {
      const result = await this.callSessionService.initiateCall({
        userId: data.userId,
        astrologerId: data.astrologerId,
        astrologerName: data.astrologerName,
        callType: data.callType,
        ratePerMinute: data.ratePerMinute
      });

      // Send incoming call notification to specific astrologer
      const astrologerSocketId = this.astrologerSockets.get(data.astrologerId);

      const payload: IncomingCallRequestPayload = {
        sessionId: result.data.sessionId,
        orderId: result.data.orderId,
        userId: data.userId,
        callType: data.callType,
        ratePerMinute: data.ratePerMinute,
        requestExpiresIn: 180000,
        sound: 'call_ringtone.mp3',
        vibration: true,
        timestamp: new Date(),
      };

      if (astrologerSocketId) {
        this.server.to(astrologerSocketId).emit('incoming_call', payload);
      } else {
        // Fallback for offline astrologer
        this.server.emit('incoming_call_to_astrologer', {
          astrologerId: data.astrologerId,
          ...payload,
        });
      }

      return result;
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== ACCEPT CALL =====
  @SubscribeMessage('accept_call')
  async handleAcceptCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      astrologerId: string;
    }
  ) {
    try {
      const result = await this.callSessionService.acceptCall(data.sessionId, data.astrologerId);

      // Notify user
      const userData = Array.from(this.activeUsers.values()).find(u => u.sessionId === data.sessionId);
      if (userData) {
        this.server.to(userData.socketId).emit('call_accepted', {
          sessionId: data.sessionId,
          astrologerId: data.astrologerId,
          message: 'Astrologer accepted your call',
          timestamp: new Date()
        });
      }

      return result;
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== REJECT CALL =====
  @SubscribeMessage('reject_call')
  async handleRejectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      astrologerId: string;
      reason?: string;
    }
  ) {
    try {
      const result = await this.callSessionService.rejectCall(
        data.sessionId,
        data.astrologerId,
        data.reason || 'rejected'
      );

      // Notify user
      const userData = Array.from(this.activeUsers.values()).find(u => u.sessionId === data.sessionId);
      if (userData) {
        this.server.to(userData.socketId).emit('call_rejected', {
          sessionId: data.sessionId,
          reason: data.reason || 'Call rejected',
          refunded: true,
          timestamp: new Date()
        });
      }

      return result;
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // Inside CallGateway
@SubscribeMessage('join_session')
handleJoinSession(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: any, // Accept any, then extract data
) {
  // Extract data (first element if array, or whole payload)
  const data = Array.isArray(payload) ? payload[0] : payload;

  if (!data?.sessionId || !data?.userId || !data?.role) {
    this.logger.warn(
      `🚫 Invalid join_session from ${client.id}: ${JSON.stringify(payload)}`
    );
    return { success: false, message: 'sessionId, userId and role required' };
  }

  client.join(data.sessionId);
  this.activeUsers.set(data.userId, {
    socketId: client.id,
    userId: data.userId,
    role: data.role,
    sessionId: data.sessionId,
  });

  this.logger.log(
    `👥 ${data.role} joined call room: session=${data.sessionId}, userId=${data.userId}`
  );

  return { success: true };
}


  // ===== START CALL =====
// src/calls/gateways/call.gateway.ts - FIXED handleStartCall

@SubscribeMessage('start_call')
async handleStartCall(
  @ConnectedSocket() client: Socket,
  @MessageBody()
  data:
    | { sessionId: string; userId: string; role: 'user' | 'astrologer' }
    | [{ sessionId: string; userId: string; role: 'user' | 'astrologer' }, any],
) {
  try {
    const payload = Array.isArray(data) ? data[0] : data;

    this.logger.log(
      `▶️ start_call received: sessionId=${payload?.sessionId}, userId=${payload?.userId}, role=${payload?.role}`,
    );

    if (!payload?.sessionId || !payload?.userId || !payload?.role) {
      throw new BadRequestException('sessionId, userId and role are required');
    }

    // 1️⃣ Start session
    const result = await this.callSessionService.startSession(payload.sessionId);

    // 2️⃣ Join room
    client.join(payload.sessionId);

    this.activeUsers.set(payload.userId, {
      socketId: client.id,
      userId: payload.userId,
      role: payload.role,
      sessionId: payload.sessionId,
    });

    await this.callSessionService.updateParticipantStatus(
      payload.sessionId,
      payload.userId,
      payload.role,
      { isOnline: true, connectionQuality: 'good' },
    );

    // 3️⃣ Load session
    const session = await this.callSessionService.getSession(payload.sessionId);
    if (!session) {
      throw new BadRequestException('Session not found');
    }

    // ✅ Generate Agora channel and tokens
    const channelName = this.agoraService.generateChannelName();
    const userUid = this.agoraService.generateUid();
    const astrologerUid = this.agoraService.generateUid();

    const userToken = this.agoraService.generateRtcToken(channelName, userUid, 'publisher');
    const astrologerToken = this.agoraService.generateRtcToken(channelName, astrologerUid, 'publisher');

    // Update session
    session.agoraChannelName = channelName;
    session.agoraUserToken = userToken;
    session.agoraAstrologerToken = astrologerToken;
    session.agoraUserUid = userUid;
    session.agoraAstrologerUid = astrologerUid;
    session.recordingStarted = new Date();
    await session.save();

    this.logger.log(`Agora channel created: ${channelName}`);

    let recordingStarted = false;

    try {
      const recordingUid = this.agoraService.generateUid();
      const recordingResult = await this.callRecordingService.startRecording(
        payload.sessionId,
        session.callType as 'audio' | 'video',
        channelName,
        recordingUid,
      );

      this.activeRecordings.set(payload.sessionId, recordingResult.recordingId);
      recordingStarted = true;
    } catch (recErr: any) {
      this.logger.error(`Recording start failed: ${recErr.message}`);
      recordingStarted = false;
    }

    // ✅ BASE PAYLOAD (shared fields)
    const basePayload = {
      sessionId: payload.sessionId,
      maxDurationMinutes: result.data.maxDurationMinutes,
      maxDurationSeconds: result.data.maxDurationSeconds,
      ratePerMinute: result.data.ratePerMinute,
      callType: result.data.callType,
      chargingStarted: true,
      agoraAppId: this.agoraService.getAppId(),
      agoraChannelName: channelName,
      agoraUserUid: userUid,
      agoraAstrologerUid: astrologerUid,
      recordingStarted,
      timestamp: new Date().toISOString(),
    };

    // ✅ EMIT TO USER with user token and UID
    const userSocket = this.activeUsers.get(session.userId.toString());
if (userSocket?.socketId) {
  this.server.to(userSocket.socketId).emit('timer_start', {
    ...basePayload,
    agoraToken: userToken,
    agoraUid: userUid,
  });
  this.logger.log(`📤 timer_start sent to USER ${session.userId} with UID ${userUid}`);
}

    // ✅ EMIT TO ASTROLOGER with astrologer token and UID
    const astrologerSocket = this.activeUsers.get(session.astrologerId.toString());
if (astrologerSocket?.socketId) {
  this.server.to(astrologerSocket.socketId).emit('timer_start', {
    ...basePayload,
    agoraToken: astrologerToken,
    agoraUid: astrologerUid,
  });
  this.logger.log(`📤 timer_start sent to ASTROLOGER ${session.astrologerId} with UID ${astrologerUid}`);
}

    // Start timer ticker
    this.startTimerTicker(payload.sessionId, result.data.maxDurationSeconds);
    this.logger.log(`Timer started for session ${payload.sessionId}`);

    // Notify other party
    client.to(payload.sessionId).emit('participant_joined', {
      userId: payload.userId,
      role: payload.role,
      isOnline: true,
      timestamp: new Date(),
    });

    return {
      success: true,
      message: 'Call started',
      data: {
        agoraChannelName: channelName,
        agoraToken: payload.role === 'user' ? userToken : astrologerToken,
        agoraUid: payload.role === 'user' ? userUid : astrologerUid,
        recordingStarted: true,
      },
    };
  } catch (error: any) {
    this.logger.error(`Start call error: ${error.message}`);
    return { success: false, message: error.message };
  }
}


   // ===== GET REAL-TIME BILLING =====
  @SubscribeMessage('get_billing')
  async handleGetBilling(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string }
  ) {
    try {
      const billing = await this.callBillingService.calculateRealTimeBilling(data.sessionId);
      return billing;
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== REAL-TIME TIMER TICKER =====
  private startTimerTicker(sessionId: string, maxDurationSeconds: number) {
    let secondsElapsed = 0;

    if (this.sessionTimers.has(sessionId)) {
      clearInterval(this.sessionTimers.get(sessionId)!);
    }

    const ticker = setInterval(async () => {
      if (secondsElapsed >= maxDurationSeconds) {
        clearInterval(ticker);
        this.sessionTimers.delete(sessionId);

        try {
          await this.endCallInternal(sessionId, 'system', 'timeout');
        } catch (error) {
          this.logger.error(`Auto-end call error: ${error}`);
        }
        return;
      }

      const remainingSeconds = maxDurationSeconds - secondsElapsed;


      this.server.to(sessionId).emit('timer_tick', {
        elapsedSeconds: secondsElapsed,
        remainingSeconds: remainingSeconds,
        maxDuration: maxDurationSeconds,
        formattedTime: this.formatTime(remainingSeconds),
        percentage: (secondsElapsed / maxDurationSeconds) * 100
      });

      if (remainingSeconds === 60) {
        this.server.to(sessionId).emit('timer_warning', {
          message: '1 minute remaining',
          remainingSeconds: 60,
          timestamp: new Date()
        });
      }

      secondsElapsed++;
    }, 1000);

    this.sessionTimers.set(sessionId, ticker);
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ===== SYNC TIMER =====
  @SubscribeMessage('sync_timer')
  async handleSyncTimer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string }
  ) {
    try {
      const session = await this.callSessionService.getSession(data.sessionId);

      if (!session || !session.startTime) {
        return { success: false, message: 'Call not active' };
      }

      const now = new Date().getTime();
      const startTime = new Date(session.startTime).getTime();
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      const remainingSeconds = Math.max(0, session.maxDurationSeconds - elapsedSeconds);

      return {
        success: true,
        data: {
          elapsedSeconds,
          remainingSeconds,
          maxDuration: session.maxDurationSeconds,
          formattedTime: this.formatTime(remainingSeconds),
          serverTime: now
        }
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== PARTICIPANT STATUS UPDATES =====
 @SubscribeMessage('participant_muted')
async handleMute(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: {
    sessionId: string;
    userId: string;
    role: 'user' | 'astrologer';
    isMuted: boolean;
  }
) {
  try {
    const ok = await this.ensureActiveCall(data.sessionId);
    if (!ok) {
      return { success: false, message: 'Call is not active' };
    }

    await this.callSessionService.updateParticipantStatus(
      data.sessionId,
      data.userId,
      data.role,
      { isMuted: data.isMuted }
    );

    client.to(data.sessionId).emit('participant_muted', {
      userId: data.userId,
      isMuted: data.isMuted,
      timestamp: new Date()
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}


  // ===== VIDEO STATUS UPDATE =====
  @SubscribeMessage('video_status')
async handleVideoStatus(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: {
    sessionId: string;
    userId: string;
    role: 'user' | 'astrologer';
    isVideoOn: boolean;
  }
) {
  try {
    const ok = await this.ensureActiveCall(data.sessionId);
    if (!ok) {
      return { success: false, message: 'Call is not active' };
    }

    await this.callSessionService.updateParticipantStatus(
      data.sessionId,
      data.userId,
      data.role,
      { isVideoOn: data.isVideoOn }
    );

    client.to(data.sessionId).emit('video_status_changed', {
      userId: data.userId,
      isVideoOn: data.isVideoOn,
      timestamp: new Date()
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}


  // ===== CONNECTION QUALITY UPDATE =====
  @SubscribeMessage('connection_quality')
async handleConnectionQuality(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: {
    sessionId: string;
    userId: string;
    role: 'user' | 'astrologer';
    quality: 'excellent' | 'good' | 'fair' | 'poor';
  }
) {
  try {
    const ok = await this.ensureActiveCall(data.sessionId);
    if (!ok) {
      return { success: false, message: 'Call is not active' };
    }

    await this.callSessionService.updateParticipantStatus(
      data.sessionId,
      data.userId,
      data.role,
      { connectionQuality: data.quality }
    );

    client.to(data.sessionId).emit('connection_quality_updated', {
      userId: data.userId,
      quality: data.quality,
      timestamp: new Date()
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

  // ===== END CALL =====
  @SubscribeMessage('end_call')
  async handleEndCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; endedBy: string; reason: string }
  ) {
    try {
      // ✅ STOP RECORDING
      let recordingUrl, recordingS3Key, recordingDuration;
      
      if (this.activeRecordings.has(data.sessionId)) {
        const session = await this.callSessionService.getSession(data.sessionId);

        const recordingResult = await this.callRecordingService.stopRecording(
          data.sessionId,
          session?.agoraChannelName || '' // ✅ ADD: Channel name
        );
        recordingUrl = recordingResult.recordingUrl;
        recordingS3Key = recordingResult.recordingS3Key;
        recordingDuration = recordingResult.recordingDuration;
        this.activeRecordings.delete(data.sessionId);
      }

      const result = await this.callSessionService.endSession(
        data.sessionId,
        data.endedBy,
        data.reason,
        recordingUrl,
        recordingS3Key,
        recordingDuration
      );

      // ✅ PROCESS BILLING
      try {
        const billingResult = await this.callBillingService.processCallBilling(data.sessionId);
        
        // Emit to both parties with billing details
        this.server.to(data.sessionId).emit('call_ended', {
          sessionId: data.sessionId,
          endedBy: data.endedBy,
          endTime: new Date(),
          actualDuration: result.data.actualDuration,
          billedMinutes: billingResult.billing.billedMinutes,
          chargeAmount: billingResult.billing.totalAmount,
          recordingUrl: recordingUrl,
          message: 'Call ended and billed',
          billing: billingResult.billing
        });
      } catch (billingError: any) {
        this.logger.error(`Billing error: ${billingError.message}`);
        // Still end the call even if billing fails
        this.server.to(data.sessionId).emit('call_ended', {
          sessionId: data.sessionId,
          endedBy: data.endedBy,
          endTime: new Date(),
          actualDuration: result.data.actualDuration,
          recordingUrl: recordingUrl,
          message: 'Call ended (billing pending)',
          billingFailed: true
        });
      }

      // Clear timer
      if (this.sessionTimers.has(data.sessionId)) {
        clearInterval(this.sessionTimers.get(data.sessionId)!);
        this.sessionTimers.delete(data.sessionId);
      }

      return { success: true, message: 'Call ended' };
    } catch (error: any) {
      this.logger.error(`End call error: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
 * ✅ Internal method to end call (used by both end_call and auto-timeout)
 */
private async endCallInternal(
  sessionId: string,
  endedBy: string,
  reason: string
): Promise<any> {
  // ✅ STOP RECORDING
  let recordingUrl, recordingS3Key, recordingDuration;
  
  // ✅ STOP RECORDING
if (this.activeRecordings.has(sessionId)) {
  const session = await this.callSessionService.getSession(sessionId);
  const recordingResult = await this.callRecordingService.stopRecording(
    sessionId,
    session?.agoraChannelName || '' // ✅ ADD THIS
  );
  recordingUrl = recordingResult.recordingUrl;
  recordingS3Key = recordingResult.recordingS3Key;
  recordingDuration = recordingResult.recordingDuration;
  this.activeRecordings.delete(sessionId);
}


  const result = await this.callSessionService.endSession(
    sessionId,
    endedBy,
    reason,
    recordingUrl,
    recordingS3Key,
    recordingDuration
  );

  // ✅ PROCESS BILLING
  try {
    const billingResult = await this.callBillingService.processCallBilling(sessionId);
    
    // Emit to both parties with billing details
    this.server.to(sessionId).emit('call_ended', {
      sessionId: sessionId,
      endedBy: endedBy,
      endTime: new Date(),
      actualDuration: result.data.actualDuration,
      billedMinutes: billingResult.billing.billedMinutes,
      chargeAmount: billingResult.billing.totalAmount,
      recordingUrl: recordingUrl,
      message: 'Call ended and billed',
      billing: billingResult.billing
    });

    this.logger.log(`Call ended and billed: ${sessionId}`);
  } catch (billingError: any) {
    this.logger.error(`Billing error: ${billingError.message}`);
    // Still end the call even if billing fails
    this.server.to(sessionId).emit('call_ended', {
      sessionId: sessionId,
      endedBy: endedBy,
      endTime: new Date(),
      actualDuration: result.data.actualDuration,
      recordingUrl: recordingUrl,
      message: 'Call ended (billing pending)',
      billingFailed: true
    });
  }

  // Clear timer
  if (this.sessionTimers.has(sessionId)) {
    clearInterval(this.sessionTimers.get(sessionId)!);
    this.sessionTimers.delete(sessionId);
  }

  return { success: true, message: 'Call ended', data: result.data };
}
}
