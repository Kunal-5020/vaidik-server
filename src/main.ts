// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.set('trust proxy', true);

  app.enableCors({
    origin: [
      'https://vaidik-admin.netlify.app',
      'http://localhost:3001',
      'http://localhost:3000',
      'http://localhost:5000',
      'https://vaidik-web.netlify.app',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400,
  });

  app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));

  // ✅ CRITICAL FIX: Add body parser for REGULAR routes FIRST
  app.use((req, res, next) => {
    // Only use special body parser for webhook route
    if (req.path.includes('/shopify/webhooks')) {
      return next();
    }
    // Use regular JSON parser for everything else
    bodyParser.json()(req, res, next);
  });

  // ✅ Then add webhook-specific raw body parser
  app.use(
    '/api/v1/shopify/webhooks',
    bodyParser.json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // ✅ Global validation pipe (will work now that body is parsed)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Server running on port ${port}`);
}

bootstrap();
