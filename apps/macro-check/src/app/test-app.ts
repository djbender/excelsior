import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { AUTH_CONFIG, type AuthConfig } from './auth/auth.config';
import { configureApp } from './configure-app';
import { PAGE_PATH } from './page.controller';

/** The gate is off unless a test asks for a password. */
const OPEN: AuthConfig = { secret: 'test-secret', secureCookie: false };

/** Boots the real AppModule, serving the page from its source location. */
export async function createTestApp(
  auth: AuthConfig = OPEN,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PAGE_PATH)
    .useValue(join(__dirname, '..', 'assets', 'index.html'))
    .overrideProvider(AUTH_CONFIG)
    .useValue(auth)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}
