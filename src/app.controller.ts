import { Controller, Get, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectConnection() private readonly mongoConnection: Connection,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth() {
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'Vaidik Talk Backend API',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: {
        status: 'disconnected',
        name: 'MongoDB',
      },
      cache: {
        status: 'disconnected',
        name: 'Redis',
      },
    };

    // Check MongoDB connection
    try {
      if (this.mongoConnection.readyState === 1) {
        health.database.status = 'connected';
      }
    } catch (error) {
      health.database.status = 'error';
    }

    // Check Redis connection
    try {
      await this.cacheManager.set('health-check', 'ok', 10);
      const result = await this.cacheManager.get('health-check');
      if (result === 'ok') {
        health.cache.status = 'connected';
      }
    } catch (error) {
      health.cache.status = 'error';
    }

    return health;
  }

  @Get('api/v1/health')
  async getApiHealth() {
    return {
      status: 'OK',
      message: 'Vaidik Talk API is running',
      timestamp: new Date().toISOString(),
      endpoints: {
        auth: '/api/v1/auth',
        users: '/api/v1/users',
        astrologers: '/api/v1/astrologers',
        conversations: '/api/v1/conversations',
        payments: '/api/v1/payments',
      },
    };
  }
}
