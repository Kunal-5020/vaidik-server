import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';

import { AppController } from './app.controller';
import { AppService } from './app.service';

// Import configuration files
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import jwtConfig from './config/jwt.config';

// Import modules
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AstrologersModule } from './astrologers/astrologers.module';
import { ChatModule } from './chat/chat.module';
import { CallsModule } from './calls/calls.module';
import { StreamingModule } from './streaming/streaming.module';
import { AdminModule } from './admin/admin.module';
import { PaymentsModule } from './payments/payments.module';
import { OrdersModule } from './orders/orders.module';
import { RemediesModule } from './remedies/remedies.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RegistrationModule } from './registration/registration.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, jwtConfig],
      envFilePath: '.env',
    }),

    // MongoDB connection
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri'),
        ...configService.get('database.options'),
      }),
      inject: [ConfigService],
    }),

     // FIXED Redis cache connection
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        try {
          const redisUrl = configService.get<string>('REDIS_URL');
          let store;

          if (redisUrl) {
            // 🔹 Use Upstash/Render Redis
            store = await redisStore({
              url: redisUrl,
              ttl: 300,
              socket: {
                tls: redisUrl.startsWith('rediss://'), // enable TLS for Upstash
              },
              keyPrefix: 'vaidiktalk:',
            });
            console.log('✅ Connected to remote Redis:', redisUrl);
          } else {
            // 🔹 Fallback to local Redis
            store = await redisStore({
              socket: {
                host: configService.get<string>('REDIS_HOST') || 'localhost',
                port: configService.get<number>('REDIS_PORT') || 6379,
              },
              ttl: 300,
              database: 0,
              keyPrefix: 'vaidiktalk:',
            });
            console.log('✅ Connected to local Redis');
          }

          return { store: () => store };
        } catch (error) {
          console.error('❌ Redis connection failed:', error.message);
          console.log('🔄 Falling back to in-memory cache');
          return { ttl: 300 };
        }
      },
      inject: [ConfigService],
    }),

    AuthModule,
    UsersModule,
    AstrologersModule,
    ChatModule,
    CallsModule,
    StreamingModule,
    AdminModule,
    PaymentsModule,
    OrdersModule,
    RemediesModule,
    ReportsModule,
    NotificationsModule,
    RegistrationModule,
    UploadModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
  ],
})
export class AppModule {}
