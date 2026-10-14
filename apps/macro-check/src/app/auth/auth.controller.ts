import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { loginPage } from './login-page';
import { createSession, SESSION_COOKIE, SESSION_TTL_MS } from './session';

/** Login attempts allowed per client address in each window. */
export const LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

@Controller('login')
export class AuthController {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  form(): string {
    return loginPage();
  }

  // Throttled only here: the guard runs before the password is checked, so a
  // locked-out client is refused (429) even with the right password.
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: LOGIN_ATTEMPTS, ttl: LOGIN_WINDOW_MS } })
  login(@Body('password') password: unknown, @Res() res: Response): void {
    // Hashing first gives timingSafeEqual equal-length inputs.
    const ok =
      this.config.password !== undefined &&
      typeof password === 'string' &&
      timingSafeEqual(sha256(password), sha256(this.config.password));
    if (!ok) {
      res
        .status(401)
        .type('text/html; charset=utf-8')
        .send(loginPage('Wrong password.'));
      return;
    }
    res.cookie(SESSION_COOKIE, createSession(this.config.secret), {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.secureCookie,
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
    res.redirect(303, '/');
  }
}
