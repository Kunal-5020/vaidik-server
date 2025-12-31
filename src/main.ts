// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.set('trust proxy', true);
  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: [
      'https://vaidik-admin.netlify.app',
      'https://vaidik-web.netlify.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5000',
    ],
    credentials: true,
  });

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: false,
    }),
  );

  /**
   * ✅ RAW BODY ONLY FOR SHOPIFY WEBHOOK
   */
  app.use(
    '/api/v1/shopify/webhooks',
    bodyParser.raw({ type: 'application/json' }),
  );

  /**
   * ✅ JSON BODY FOR ALL OTHER ROUTES
   */
  app.use(bodyParser.json());

  /**
   * ✅ Validation Pipe
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  /**
   * ✅ Swagger
   */
  const config = new DocumentBuilder()
    .setTitle('Project API')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  fs.writeFileSync('./openapi.json', JSON.stringify(document, null, 2));

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Server running on port ${port}`);
}

bootstrap();
