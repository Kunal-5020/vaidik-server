import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LiveStream, LiveStreamDocument } from '../schemas/live-stream.schema';
import { StreamViewer, StreamViewerDocument } from '../schemas/stream-viewer.schema';

export interface RetentionBucket {
  timePercent: number;
  retainedViewers: number;
  retentionRate: number;
}


@Injectable()
export class StreamAnalyticsService {
  private readonly logger = new Logger(StreamAnalyticsService.name);

  constructor(
    @InjectModel(LiveStream.name) private liveStreamModel: Model<LiveStreamDocument>,
    @InjectModel(StreamViewer.name) private streamViewerModel: Model<StreamViewerDocument>,
  ) {}

  // Get real-time stream metrics
  async getRealtimeMetrics(streamId: string) {
    const stream = await this.liveStreamModel.findOne({ streamId });
    
    if (!stream) {
      return null;
    }

    const activeViewers = await this.streamViewerModel.countDocuments({
      streamId,
      isActive: true
    });

    return {
      streamId,
      currentViewers: activeViewers,
      totalViewers: stream.totalViewers,
      maxViewers: stream.maxViewers,
      totalTips: stream.totalTips,
      totalMessages: stream.totalMessages,
      duration: stream.status === 'live' && stream.startedAt 
        ? Math.floor((new Date().getTime() - stream.startedAt.getTime()) / 1000)
        : stream.duration,
      status: stream.status
    };
  }

  // Get astrologer's streaming performance
  async getAstrologerPerformance(astrologerId: string, period: 'week' | 'month' | 'year' = 'month') {
    const periodDate = new Date();
    
    switch (period) {
      case 'week':
        periodDate.setDate(periodDate.getDate() - 7);
        break;
      case 'month':
        periodDate.setMonth(periodDate.getMonth() - 1);
        break;
      case 'year':
        periodDate.setFullYear(periodDate.getFullYear() - 1);
        break;
    }

    const streams = await this.liveStreamModel.find({
      astrologerId,
      createdAt: { $gte: periodDate },
      status: 'ended'
    });

    const totalStreams = streams.length;
    const totalViewers = streams.reduce((sum, stream) => sum + stream.totalViewers, 0);
    const totalTips = streams.reduce((sum, stream) => sum + stream.totalTips, 0);
    const totalMinutes = streams.reduce((sum, stream) => sum + Math.ceil(stream.duration / 60), 0);
    
    const averageViewers = totalStreams > 0 ? Math.floor(totalViewers / totalStreams) : 0;
    const averageDuration = totalStreams > 0 ? Math.floor(totalMinutes / totalStreams) : 0;

    return {
      period,
      totalStreams,
      totalViewers,
      totalTips,
      totalMinutes,
      averageViewers,
      averageDuration,
      topStream: streams.sort((a, b) => b.totalViewers - a.totalViewers)[0] || null
    };
  }

  // Get viewer engagement analytics
  async getEngagementAnalytics(streamId: string) {
    const stream = await this.liveStreamModel.findOne({ streamId });
    const viewers = await this.streamViewerModel.find({ streamId });

    if (!stream) {
      return null;
    }

    const totalWatchTime = viewers.reduce((sum, viewer) => sum + (viewer.watchDuration || 0), 0);
    const averageWatchTime = viewers.length > 0 ? Math.floor(totalWatchTime / viewers.length) : 0;
    
    const engagementRate = stream.totalMessages > 0 
      ? Math.floor((stream.totalMessages / stream.totalViewers) * 100)
      : 0;

    const tippingRate = stream.tips.length > 0
      ? Math.floor((stream.tips.length / stream.totalViewers) * 100)
      : 0;

    return {
      streamId,
      totalViewers: stream.totalViewers,
      averageWatchTime,
      engagementRate,
      tippingRate,
      totalMessages: stream.totalMessages,
      totalTips: stream.totalTips,
      averageTipAmount: stream.tips.length > 0 
        ? Math.floor(stream.totalTips / stream.tips.length)
        : 0,
      viewerRetention: this.calculateViewerRetention(viewers, stream.duration)
    };
  }

  // FIXED: Calculate viewer retention over time with proper typing
  private calculateViewerRetention(viewers: StreamViewerDocument[], streamDuration: number): RetentionBucket[] {
    if (viewers.length === 0 || streamDuration === 0) {
      return [];
    }

    // Create retention buckets (every 10% of stream duration)
    const buckets: RetentionBucket[] = [];
    const bucketSize = streamDuration / 10;

    for (let i = 0; i < 10; i++) {
      const bucketStart = i * bucketSize;
      const bucketEnd = (i + 1) * bucketSize;
      
      const retainedViewers = viewers.filter(viewer => 
        (viewer.watchDuration || 0) >= bucketEnd
      ).length;

      buckets.push({
        timePercent: (i + 1) * 10,
        retainedViewers,
        retentionRate: Math.floor((retainedViewers / viewers.length) * 100)
      });
    }

    return buckets;
  }

  // Get trending topics/tags
  async getTrendingTopics(period: 'day' | 'week' | 'month' = 'week') {
    const periodDate = new Date();
    
    switch (period) {
      case 'day':
        periodDate.setDate(periodDate.getDate() - 1);
        break;
      case 'week':
        periodDate.setDate(periodDate.getDate() - 7);
        break;
      case 'month':
        periodDate.setMonth(periodDate.getMonth() - 1);
        break;
    }

    const streams = await this.liveStreamModel.find({
      createdAt: { $gte: periodDate },
      status: { $in: ['live', 'ended'] }
    });

    // Count tag occurrences
    const tagCount: Record<string, number> = {};
    streams.forEach(stream => {
      stream.tags.forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    });

    // Sort by popularity
    const trendingTags = Object.entries(tagCount)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count, period }));

    return trendingTags;
  }

  // Get platform-wide streaming statistics
  async getPlatformStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalStreams,
      liveStreams,
      todayStreams,
      totalViewers,
      totalTips
    ] = await Promise.all([
      this.liveStreamModel.countDocuments(),
      this.liveStreamModel.countDocuments({ status: 'live' }),
      this.liveStreamModel.countDocuments({ createdAt: { $gte: todayStart } }),
      this.streamViewerModel.countDocuments(),
      this.liveStreamModel.aggregate([
        { $group: { _id: null, total: { $sum: '$totalTips' } } }
      ])
    ]);

    return {
      totalStreams,
      liveStreams,
      todayStreams,
      totalViewers,
      totalTips: totalTips[0]?.total || 0,
      averageViewersPerStream: totalStreams > 0 ? Math.floor(totalViewers / totalStreams) : 0
    };
  }
}
