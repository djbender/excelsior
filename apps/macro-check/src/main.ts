import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';

const HOST = process.env.HOST ?? 'localhost';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const port = process.env.PORT || 3000;
  // This tool has no auth of its own: it defaults to localhost, and when HOST
  // opens it up, the reverse proxy in front must provide authentication.
  await app.listen(port, HOST);
  Logger.log(`macro-check listening on http://${HOST}:${port}`);
}

bootstrap();
