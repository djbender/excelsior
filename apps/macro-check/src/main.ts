import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';

const HOST = process.env.HOST ?? 'localhost';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

async function bootstrap() {
  // Fail closed: never expose the app beyond this machine without the gate.
  if (!process.env.APP_PASSWORD && !LOOPBACK_HOSTS.has(HOST)) {
    throw new Error(`APP_PASSWORD must be set when HOST is ${HOST}`);
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  // Behind a reverse proxy, count login attempts per real client, not per proxy.
  const proxyHops = Number(process.env.TRUST_PROXY);
  if (proxyHops > 0) app.set('trust proxy', proxyHops);
  const port = process.env.PORT || 3000;
  // The password gate is on whenever APP_PASSWORD is set.
  await app.listen(port, HOST);
  Logger.log(`macro-check listening on http://${HOST}:${port}`);
}

bootstrap();
