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

  // ✅ CRITICAL: Trust proxy for Render
  app.set('trust proxy', true);

  // ✅ CORS Configuration for Netlify frontend
  app.enableCors({
    origin: [
      'https://vaidik-admin.netlify.app', // Your Netlify frontend
      'http://localhost:3001', // Local development
      'http://localhost:3000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400, // 24 hours
  });

  // ✅ Helmet with relaxed settings
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: false,
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

  // ✅ CRITICAL: Use PORT from environment (Render provides this)
  const port = process.env.PORT || 3001;
  
  // ✅ Listen on 0.0.0.0 (required for Render)
  await app.listen(port, '0.0.0.0');
  
  logger.log(`🚀 Server running on port ${port}`);
  logger.log(`🌍 CORS enabled for: https://vaidik-admin.netlify.app`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start:', error);
  process.exit(1);
});
