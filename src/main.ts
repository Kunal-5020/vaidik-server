import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Trust proxy to get real IP addresses
  app.set('trust proxy', true);

  // ✅ FIX: Properly construct allowed origins array
  const allowedOrigins: string[] = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://vaidik-admin.netlify.app',
  ];

  // Add CLIENT_URL from env if it exists
  const clientUrl = configService.get<string>('CLIENT_URL');
  if (clientUrl) {
    allowedOrigins.push(clientUrl);
  }

  // ✅ Enable CORS with properly typed origins
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Security middleware (apply after CORS)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false, // Disable for API
    })
  );

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: false,
    }),
  );

  // API prefix
  app.setGlobalPrefix('api/v1');

  const port = configService.get<number>('PORT') || 3001;
  
  await app.listen(port, '0.0.0.0');
  
  logger.log(`🚀 Vaidik Talk Backend is running on: http://localhost:${port}`);
  logger.log(`📋 Health check available at: http://localhost:${port}/api/v1/health`);
  logger.log(`🔗 Allowed origins: ${JSON.stringify(allowedOrigins)}`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start the application:', error);
  process.exit(1);
});
