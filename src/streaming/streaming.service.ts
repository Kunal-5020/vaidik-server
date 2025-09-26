import { Injectable } from '@nestjs/common';
import { StreamManagementService } from './services/stream-management.service';
import { StreamAnalyticsService } from './services/stream-analytics.service';

@Injectable()
export class StreamingService {
  constructor(
    private streamManagementService: StreamManagementService,
    private streamAnalyticsService: StreamAnalyticsService,
  ) {}

  // === STREAM MANAGEMENT METHODS ===
  
  async createStream(astrologerId: string, createStreamDto: any) {
    return this.streamManagementService.createStream(astrologerId, createStreamDto);
  }

  async startStream(astrologerId: string, streamId: string) {
    return this.streamManagementService.startStream(astrologerId, streamId);
  }

  async joinStreamAsViewer(userId: string, streamId: string) {
    return this.streamManagementService.joinStreamAsViewer(userId, streamId);
  }

  async endStream(astrologerId: string, streamId: string) {
    return this.streamManagementService.endStream(astrologerId, streamId);
  }

  // ADDED: Missing methods
  async leaveStream(userId: string, streamId: string) {
    return this.streamManagementService.leaveStream(userId, streamId);
  }

  async sendTip(userId: string, streamId: string, amount: number, message?: string) {
    return this.streamManagementService.sendTip(userId, streamId, amount, message);
  }

  async getLiveStreams(page?: number, limit?: number, category?: string) {
    return this.streamManagementService.getLiveStreams(page, limit, category);
  }

  async getStreamDetails(streamId: string) {
    return this.streamManagementService.getStreamDetails(streamId);
  }

  async getAstrologerStreams(astrologerId: string, status?: string) {
    return this.streamManagementService.getAstrologerStreams(astrologerId, status);
  }

  async getStreamAnalytics(astrologerId: string, streamId: string) {
    return this.streamManagementService.getStreamAnalytics(astrologerId, streamId);
  }

  async getStreamViewerCount(streamId: string): Promise<number> {
    return this.streamManagementService.getStreamViewerCount(streamId);
  }

  // === ANALYTICS METHODS ===
  
  async getRealtimeMetrics(streamId: string) {
    return this.streamAnalyticsService.getRealtimeMetrics(streamId);
  }

  async getAstrologerPerformance(astrologerId: string, period?: 'week' | 'month' | 'year') {
    return this.streamAnalyticsService.getAstrologerPerformance(astrologerId, period);
  }

  async getEngagementAnalytics(streamId: string) {
    return this.streamAnalyticsService.getEngagementAnalytics(streamId);
  }

  // ADDED: Missing analytics methods
  async getTrendingTopics(period?: 'day' | 'week' | 'month') {
    return this.streamAnalyticsService.getTrendingTopics(period);
  }

  async getPlatformStats() {
    return this.streamAnalyticsService.getPlatformStats();
  }
}
