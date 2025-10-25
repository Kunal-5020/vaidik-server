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
import { StreamSessionService } from '../services/stream-session.service';
import { Inject, forwardRef } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/stream',
  transports: ['websocket', 'polling'],
})
export class StreamGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets: Map<string, string> = new Map();
  private streamHosts: Map<string, string> = new Map();
  private socketToStream: Map<string, string> = new Map();
  private streamHeartbeats: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    @Inject(forwardRef(() => StreamSessionService)) 
    private streamSessionService: StreamSessionService
  ) {}

  handleConnection(client: Socket) {
  console.log('====================================');
  console.log('✅ NEW CLIENT CONNECTED');
  console.log('Socket ID:', client.id);
  console.log('Handshake Query:', client.handshake.query);
  console.log('Handshake Auth:', client.handshake.auth);
  console.log('====================================');
  
  const userId = client.handshake.query.userId as string;
  const userName = client.handshake.query.userName as string;
  
  if (userId) {
    this.userSockets.set(userId, client.id);
    console.log(`📝 User socket mapped: ${userId} -> ${client.id} (${userName})`);
    console.log('📊 Total mapped sockets:', this.userSockets.size);
    console.log('📊 All mapped users:', Array.from(this.userSockets.keys()));
  } else {
    console.warn('⚠️ No userId in handshake query!');
  }
}

   async handleDisconnect(client: Socket) {
  console.log('====================================');
  console.log('❌ CLIENT DISCONNECTED');
  console.log('Socket ID:', client.id);
  console.log('====================================');

  // Check if this socket was hosting a stream
  const streamId = this.socketToStream.get(client.id);
  
  if (streamId) {
    console.log('🔴 HOST DISCONNECTED - ENDING STREAM');
    console.log('Stream ID:', streamId);

    const hostUserId = this.streamHosts.get(streamId);
    
    if (hostUserId) {
      try {
        // ✅ Automatically end the stream
        await this.streamSessionService.endStream(streamId, hostUserId);
        
        // Notify all viewers
        this.server.to(streamId).emit('stream_ended', {
          reason: 'Host disconnected',
          timestamp: new Date().toISOString(),
        });

        console.log('✅ Stream automatically ended');
      } catch (error) {
        console.error('❌ Error ending stream:', error);
      }

      // Clean up mappings
      this.streamHosts.delete(streamId);
      this.userSockets.delete(hostUserId);
    }

    this.socketToStream.delete(client.id);
  }

  // Remove from user sockets map
  for (const [userId, socketId] of this.userSockets.entries()) {
    if (socketId === client.id) {
      this.userSockets.delete(userId);
      console.log(`🗑️ User socket removed: ${userId}`);
      break;
    }
  }
}



  /**
   * ✅ NEW: Helper method to notify host of call request
   * Called by service after adding to waitlist
   */
  notifyCallRequest(
  streamId: string,
  data: {
    userId: string;
    userName: string;
    userAvatar: string | null;
    callType: 'voice' | 'video';
    callMode: 'public' | 'private';
    position: number;
  }
) {
  console.log('📞 ===== NOTIFYING HOST OF CALL REQUEST =====');
  console.log('📞 Stream ID:', streamId);
  console.log('📞 User:', data.userName);

  const hostUserId = this.streamHosts.get(streamId);
  
  if (!hostUserId) {
    console.error('❌ No host found for stream:', streamId);
    return;
  }

  console.log('📝 Host User ID:', hostUserId);

  const hostSocketId = this.userSockets.get(hostUserId);
  
  if (!hostSocketId) {
    console.error('❌ Host not connected to socket:', hostUserId);
    return;
  }

  console.log('📝 Host Socket ID:', hostSocketId);

  // ✅ ADD MORE LOGGING
  console.log('📡 Emitting event: call_request_received');
  console.log('📡 To socket:', hostSocketId);
  console.log('📡 Event data:', data);

  // Emit to host's socket
  this.server.to(hostSocketId).emit('call_request_received', {
    streamId,
    userId: data.userId,
    userName: data.userName,
    userAvatar: data.userAvatar,
    callType: data.callType,
    callMode: data.callMode,
    position: data.position,
    timestamp: new Date().toISOString(),
  });

  console.log('✅ Event emitted successfully');
  console.log('📞 ===== NOTIFICATION COMPLETE =====');
}

  // ==================== STREAM EVENTS ====================

  /**
   * Join stream room
   */
  @SubscribeMessage('join_stream')
async handleJoinStream(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { 
    streamId: string; 
    userId: string; 
    userName: string;
    isHost?: boolean;
  }
) {
  console.log('====================================');
  console.log('📺 JOIN_STREAM EVENT RECEIVED');
  console.log('Socket ID:', client.id);
  console.log('Data:', JSON.stringify(data, null, 2));
  console.log('====================================');
  
  client.join(data.streamId);
  console.log(`✅ Socket ${client.id} joined room: ${data.streamId}`);
  
  if (data.isHost) {
    this.streamHosts.set(data.streamId, data.userId);
    this.socketToStream.set(client.id, data.streamId);
    console.log('====================================');
    console.log('🎬 HOST REGISTERED');
    console.log('Stream ID:', data.streamId);
    console.log('Host User ID:', data.userId);
    console.log('Host Name:', data.userName);
    console.log('📊 Total registered hosts:', this.streamHosts.size);
    console.log('📊 All streams with hosts:', Array.from(this.streamHosts.entries()));
    console.log('====================================');
  }
  
  client.to(data.streamId).emit('viewer_joined', {
    userId: data.userId,
    userName: data.userName,
    timestamp: new Date()
  });

  return { success: true };
}

  /**
   * Leave stream room
   */
  @SubscribeMessage('leave_stream')
  async handleLeaveStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamId: string; userId: string; userName: string }
  ) {
    client.leave(data.streamId);
    
    await this.streamSessionService.leaveStream(data.streamId, data.userId);

    client.to(data.streamId).emit('viewer_left', {
      userId: data.userId,
      userName: data.userName,
      timestamp: new Date()
    });

    return { success: true };
  }

  // ==================== CHAT EVENTS ====================

  /**
   * Send comment/message
   */
  @SubscribeMessage('send_comment')
  async handleSendComment(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { 
      streamId: string; 
      userId: string; 
      userName: string; 
      userAvatar?: string;
      comment: string 
    }
  ) {
    // Broadcast to all viewers
    this.server.to(data.streamId).emit('new_comment', {
      userId: data.userId,
      userName: data.userName,
      userAvatar: data.userAvatar,
      comment: data.comment,
      timestamp: new Date()
    });

    // Update analytics
    await this.streamSessionService.updateStreamAnalytics(data.streamId, {
      incrementComments: 1
    });

    return { success: true };
  }

  // ==================== INTERACTION EVENTS ====================

  /**
   * Send like
   */
  @SubscribeMessage('send_like')
  async handleSendLike(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamId: string; userId: string; userName: string }
  ) {
    this.server.to(data.streamId).emit('new_like', {
      userId: data.userId,
      userName: data.userName,
      timestamp: new Date()
    });

    await this.streamSessionService.updateStreamAnalytics(data.streamId, {
      incrementLikes: 1
    });

    return { success: true };
  }

  /**
   * Send gift (with animation)
   */
  @SubscribeMessage('send_gift')
  async handleSendGift(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { 
      streamId: string; 
      userId: string; 
      userName: string; 
      userAvatar?: string;
      giftType: string; 
      giftName: string;
      amount: number 
    }
  ) {
    // Broadcast gift animation to all viewers
    this.server.to(data.streamId).emit('new_gift', {
      userId: data.userId,
      userName: data.userName,
      userAvatar: data.userAvatar,
      giftType: data.giftType,
      giftName: data.giftName,
      amount: data.amount,
      timestamp: new Date()
    });

    await this.streamSessionService.updateStreamAnalytics(data.streamId, {
      incrementGifts: 1,
      addRevenue: data.amount
    });

    return { success: true };
  }

  // ==================== CALL EVENTS ====================

  /**
   * Call request received
   */
  @SubscribeMessage('call_requested')
  handleCallRequested(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      streamId: string;
      userId: string;
      userName: string;
      userAvatar?: string;
      callType: 'voice' | 'video';
      callMode: 'public' | 'private';
      position: number;
    }
  ) {
    // Notify host
    this.server.to(data.streamId).emit('call_request_received', {
      userId: data.userId,
      userName: data.userName,
      userAvatar: data.userAvatar,
      callType: data.callType,
      callMode: data.callMode,
      position: data.position,
      timestamp: new Date()
    });

    return { success: true };
  }

  /**
   * Call accepted
   */
  @SubscribeMessage('call_accepted')
  handleCallAccepted(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      streamId: string;
      userId: string;
      userName: string;
      callType: 'voice' | 'video';
      callMode: 'public' | 'private';
    }
  ) {
    // Notify all viewers
    this.server.to(data.streamId).emit('call_started', {
      userId: data.userId,
      userName: data.userName,
      callType: data.callType,
      callMode: data.callMode,
      timestamp: new Date()
    });

    return { success: true };
  }

 /**
 * Reject call request
 */
@SubscribeMessage('call_rejected')
handleCallRejected(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: {
    streamId: string;
    userId: string;
  }
) {
  console.log('====================================');
  console.log('❌ HOST REJECTED CALL');
  console.log('Stream ID:', data.streamId);
  console.log('Rejected User ID:', data.userId);
  console.log('====================================');

  // ✅ Get user's socket ID from the map
  const userSocketId = this.userSockets.get(data.userId);
  
  console.log('📝 User socket map:', Array.from(this.userSockets.entries()));
  console.log('📝 Looking for user:', data.userId);
  console.log('📝 Found socket ID:', userSocketId);

  if (userSocketId) {
    // ✅ Emit DIRECTLY to the user's socket
    this.server.to(userSocketId).emit('call_request_rejected', {
      streamId: data.streamId,
      userId: data.userId,
      reason: 'Host declined your request',
      timestamp: new Date().toISOString(),
    });
    
    console.log('✅ Rejection sent to socket:', userSocketId);
  } else {
    console.error('❌ User socket not found!');
  }

  return { success: true };
}

  /**
   * Call ended
   */
  @SubscribeMessage('call_ended')
  handleCallEnded(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      streamId: string;
      duration: number;
      charge: number;
    }
  ) {
    // Notify all viewers
    this.server.to(data.streamId).emit('call_finished', {
      duration: data.duration,
      charge: data.charge,
      timestamp: new Date()
    });

    return { success: true };
  }

  /**
   * Call mode changed
   */
  @SubscribeMessage('call_mode_changed')
  handleCallModeChanged(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      streamId: string;
      mode: 'public' | 'private';
    }
  ) {
    // Notify all viewers
    this.server.to(data.streamId).emit('call_mode_updated', {
      mode: data.mode,
      timestamp: new Date()
    });

    return { success: true };
  }

  /**
   * User camera toggled
   */
  @SubscribeMessage('user_camera_toggled')
  handleUserCameraToggled(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      streamId: string;
      enabled: boolean;
    }
  ) {
    // Notify all viewers
    this.server.to(data.streamId).emit('user_camera_updated', {
      enabled: data.enabled,
      timestamp: new Date()
    });

    return { success: true };
  }

  // ==================== HOST CONTROL EVENTS ====================

  /**
   * Host mic toggled
   */
  @SubscribeMessage('host_mic_toggled')
  handleHostMicToggled(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      streamId: string;
      enabled: boolean;
    }
  ) {
    this.server.to(data.streamId).emit('host_mic_updated', {
      enabled: data.enabled,
      timestamp: new Date()
    });

    return { success: true };
  }

  /**
   * Host camera toggled
   */
  @SubscribeMessage('host_camera_toggled')
  handleHostCameraToggled(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      streamId: string;
      enabled: boolean;
    }
  ) {
    this.server.to(data.streamId).emit('host_camera_updated', {
      enabled: data.enabled,
      timestamp: new Date()
    });

    return { success: true };
  }

  /**
   * Stream state changed
   */
  @SubscribeMessage('stream_state_changed')
  handleStreamStateChanged(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      streamId: string;
      state: 'streaming' | 'on_call' | 'idle';
    }
  ) {
    this.server.to(data.streamId).emit('stream_state_updated', {
      state: data.state,
      timestamp: new Date()
    });

    return { success: true };
  }

  /**
   * Viewer count updated
   */
  @SubscribeMessage('update_viewer_count')
  handleUpdateViewerCount(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamId: string; count: number }
  ) {
    this.server.to(data.streamId).emit('viewer_count_updated', {
      count: data.count,
      timestamp: new Date()
    });
  }

  /**
   * Waitlist updated
   */
  @SubscribeMessage('waitlist_updated')
  handleWaitlistUpdated(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      streamId: string;
      waitlist: any[];
    }
  ) {
    this.server.to(data.streamId).emit('call_waitlist_updated', {
      waitlist: data.waitlist,
      timestamp: new Date()
    });

    return { success: true };
  }

  // ==================== ADMIN EVENTS ====================

  /**
   * Force end stream (admin)
   */
  @SubscribeMessage('admin_end_stream')
  handleAdminEndStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      streamId: string;
      reason: string;
    }
  ) {
    this.server.to(data.streamId).emit('stream_force_ended', {
      reason: data.reason,
      timestamp: new Date()
    });

    return { success: true };
  }

  @SubscribeMessage('stream_heartbeat')
handleStreamHeartbeat(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { streamId: string }
) {
  console.log('💓 Heartbeat received for stream:', data.streamId);

  // Clear existing timeout
  if (this.streamHeartbeats.has(data.streamId)) {
    clearTimeout(this.streamHeartbeats.get(data.streamId));
  }

  // Set new timeout - if no heartbeat in 30 seconds, end stream
  const timeout = setTimeout(async () => {
    console.log('⚠️ No heartbeat received - ending stream:', data.streamId);
    
    const hostUserId = this.streamHosts.get(data.streamId);
    if (hostUserId) {
      try {
        await this.streamSessionService.endStream(data.streamId, hostUserId);
        
        this.server.to(data.streamId).emit('stream_ended', {
          reason: 'Connection lost',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error ending stream:', error);
      }

      this.streamHosts.delete(data.streamId);
      this.streamHeartbeats.delete(data.streamId);
    }
  }, 30000); // 30 seconds

  this.streamHeartbeats.set(data.streamId, timeout);

  return { success: true };
}
}
