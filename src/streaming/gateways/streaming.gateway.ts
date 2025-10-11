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
})
export class StreamGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private streamSessionService: StreamSessionService) {}

  handleConnection(client: Socket) {
    console.log(`Stream client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Stream client disconnected: ${client.id}`);
  }

  // Join stream room
  @SubscribeMessage('join_stream')
  handleJoinStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamId: string; userId: string }
  ) {
    client.join(data.streamId);
    
    // Notify others
    client.to(data.streamId).emit('viewer_joined', {
      userId: data.userId,
      timestamp: new Date()
    });

    return { success: true };
  }

  // Leave stream room
  @SubscribeMessage('leave_stream')
  async handleLeaveStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamId: string; userId: string }
  ) {
    client.leave(data.streamId);
    
    // Update watch time
    await this.streamSessionService.leaveStream(data.streamId, data.userId);

    client.to(data.streamId).emit('viewer_left', {
      userId: data.userId,
      timestamp: new Date()
    });

    return { success: true };
  }

  // Send comment
  @SubscribeMessage('send_comment')
  async handleSendComment(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamId: string; userId: string; userName: string; comment: string }
  ) {
    // Broadcast comment to all viewers
    this.server.to(data.streamId).emit('new_comment', {
      userId: data.userId,
      userName: data.userName,
      comment: data.comment,
      timestamp: new Date()
    });

    // Update analytics
    await this.streamSessionService.updateStreamAnalytics(data.streamId, {
      incrementComments: 1
    });

    return { success: true };
  }

  // Send like
  @SubscribeMessage('send_like')
  async handleSendLike(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamId: string; userId: string }
  ) {
    this.server.to(data.streamId).emit('new_like', {
      userId: data.userId,
      timestamp: new Date()
    });

    await this.streamSessionService.updateStreamAnalytics(data.streamId, {
      incrementLikes: 1
    });

    return { success: true };
  }

  // Send gift
  @SubscribeMessage('send_gift')
  async handleSendGift(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamId: string; userId: string; userName: string; giftType: string; amount: number }
  ) {
    this.server.to(data.streamId).emit('new_gift', {
      userId: data.userId,
      userName: data.userName,
      giftType: data.giftType,
      amount: data.amount,
      timestamp: new Date()
    });

    await this.streamSessionService.updateStreamAnalytics(data.streamId, {
      incrementGifts: 1,
      addRevenue: data.amount
    });

    return { success: true };
  }

  // Update viewer count
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
}
