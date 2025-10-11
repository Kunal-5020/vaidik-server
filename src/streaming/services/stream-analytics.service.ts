import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StreamSession, StreamSessionDocument } from '../schemas/stream-session.schema';
import { StreamViewer, StreamViewerDocument } from '../schemas/stream-viewer.schema';

@Injectable()
export class StreamAnalyticsService {
  constructor(
    @InjectModel(StreamSession.name) private streamModel: Model<StreamSessionDocument>,
    @InjectModel(StreamViewer.name) private viewerModel: Model<StreamViewerDocument>,
  ) {}

  // Get stream analytics
  async getStreamAnalytics(streamId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId }).lean();
    if (!stream) {
      throw new Error('Stream not found');
    }

    const [topViewers, averageWatchTime] = await Promise.all([
      this.viewerModel
        .find({ streamId })
        .sort({ watchTime: -1 })
        .limit(10)
        .populate('userId', 'name profileImage')
        .lean(),
      this.viewerModel.aggregate([
        { $match: { streamId } },
        { $group: { _id: null, avgWatchTime: { $avg: '$watchTime' } } }
      ])
    ]);

    return {
      success: true,
      data: {
        streamId: stream.streamId,
        duration: stream.duration,
        totalViews: stream.totalViews,
        peakViewers: stream.peakViewers,
        averageViewers: Math.floor(stream.totalWatchTime / stream.duration) || 0,
        totalLikes: stream.totalLikes,
        totalComments: stream.totalComments,
        totalGifts: stream.totalGifts,
        totalRevenue: stream.totalRevenue,
        averageWatchTime: averageWatchTime[0]?.avgWatchTime || 0,
        topViewers
      }
    };
  }

  // Get host analytics
  async getHostAnalytics(hostId: string): Promise<any> {
    const [totalStreams, totalViews, totalRevenue, averageViewers] = await Promise.all([
      this.streamModel.countDocuments({ hostId, status: 'ended' }),
      this.streamModel.aggregate([
        { $match: { hostId: hostId, status: 'ended' } },
        { $group: { _id: null, total: { $sum: '$totalViews' } } }
      ]),
      this.streamModel.aggregate([
        { $match: { hostId: hostId, status: 'ended' } },
        { $group: { _id: null, total: { $sum: '$totalRevenue' } } }
      ]),
      this.streamModel.aggregate([
        { $match: { hostId: hostId, status: 'ended' } },
        { $group: { _id: null, avg: { $avg: '$peakViewers' } } }
      ])
    ]);

    return {
      success: true,
      data: {
        totalStreams,
        totalViews: totalViews[0]?.total || 0,
        totalRevenue: totalRevenue[0]?.total || 0,
        averagePeakViewers: Math.floor(averageViewers[0]?.avg || 0)
      }
    };
  }
}
