import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'node:path';
import { AUTH_CONFIG, authConfigFromEnv } from './auth/auth.config';
import {
  AuthController,
  LOGIN_ATTEMPTS,
  LOGIN_WINDOW_MS,
} from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { InspectBatchController } from './inspect-batch.controller';
import { InspectController } from './inspect.controller';
import { PAGE_PATH, PageController } from './page.controller';

@Module({
  // Supplies the throttler's storage; only the login route applies a guard.
  imports: [
    ThrottlerModule.forRoot([{ ttl: LOGIN_WINDOW_MS, limit: LOGIN_ATTEMPTS }]),
  ],
  controllers: [
    InspectController,
    InspectBatchController,
    PageController,
    AuthController,
  ],
  // The webpack build copies src/assets next to main.js.
  providers: [
    { provide: PAGE_PATH, useValue: join(__dirname, 'assets', 'index.html') },
    { provide: AUTH_CONFIG, useFactory: () => authConfigFromEnv() },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
