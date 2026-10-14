import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

const HOST = '127.0.0.1';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3000;
  // Localhost only: this internal tool has no auth.
  await app.listen(port, HOST);
  Logger.log(`macro-check listening on http://${HOST}:${port}`);
}

bootstrap();
