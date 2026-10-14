import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { isValidSession, readCookie, SESSION_COOKIE } from './session';

/** Requires a valid session on every route except the login page itself. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.password) return true;
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    if (req.path === '/login') return true;

    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (isValidSession(token, this.config.secret)) return true;

    if (req.method === 'GET' && req.path === '/') {
      http.getResponse<Response>().redirect('/login');
      return false;
    }
    throw new UnauthorizedException();
  }
}
