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

  constructor(private streamSessionService: StreamSessionService) {}

  handleConnection(client: Socket) {
    console.log(`✅Stream client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`❌Stream client disconnected: ${client.id}`);
  }

  // ==================== STREAM EVENTS ====================

  /**
   * Join stream room
   */
  @SubscribeMessage('join_stream')
  handleJoinStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamId: string; userId: string; userName: string }
  ) {
    client.join(data.streamId);
    
    // Notify others
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
   * Call rejected
   */
  @SubscribeMessage('call_rejected')
  handleCallRejected(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      streamId: string;
      userId: string;
    }
  ) {
    // Notify specific user
    this.server.to(data.streamId).emit('call_request_rejected', {
      userId: data.userId,
      timestamp: new Date()
    });

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
}
