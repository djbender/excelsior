import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../test-app';
import { authConfigFromEnv } from './auth.config';
import { createSession, isValidSession, SESSION_TTL_MS } from './session';

const CONFIG = { password: 'hunter2', secret: 's3cret', secureCookie: false };

describe('password gate', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(CONFIG);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET / without a session', () => {
    let response: request.Response;

    beforeAll(async () => {
      response = await request(app.getHttpServer()).get('/');
    });

    it('redirects', () => {
      expect(response.status).toBe(302);
    });

    it('sends the visitor to the login page', () => {
      expect(response.headers.location).toBe('/login');
    });
  });

  it('answers 401 to an API call without a session', async () => {
    const response = await request(app.getHttpServer()).post('/api/inspect');
    expect(response.status).toBe(401);
  });

  it('serves the login page', async () => {
    const response = await request(app.getHttpServer()).get('/login');
    expect(response.text).toContain('type="password"');
  });

  describe('a wrong password', () => {
    let response: request.Response;

    beforeAll(async () => {
      response = await request(app.getHttpServer())
        .post('/login')
        .type('form')
        .send({ password: 'nope' });
    });

    it('answers 401', () => {
      expect(response.status).toBe(401);
    });

    it('sets no cookie', () => {
      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('the right password', () => {
    let login: request.Response;

    beforeAll(async () => {
      login = await request(app.getHttpServer())
        .post('/login')
        .type('form')
        .send({ password: CONFIG.password });
    });

    it('redirects to the app', () => {
      expect(login.headers.location).toBe('/');
    });

    it('sets an HttpOnly cookie', () => {
      expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    });

    it('sets a SameSite=Strict cookie', () => {
      expect(login.headers['set-cookie'][0]).toContain('SameSite=Strict');
    });

    it('lets the session reach the page', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .set('Cookie', login.headers['set-cookie']);
      expect(response.status).toBe(200);
    });
  });

  describe('repeated wrong passwords', () => {
    let blocked: request.Response;

    beforeAll(async () => {
      const limited = await createTestApp(CONFIG);
      const agent = request(limited.getHttpServer());
      for (let i = 0; i < 5; i++) {
        await agent.post('/login').type('form').send({ password: 'nope' });
      }
      // Even the right password is refused while locked out.
      blocked = await agent
        .post('/login')
        .type('form')
        .send({ password: CONFIG.password });
      await limited.close();
    });

    it('answers 429', () => {
      expect(blocked.status).toBe(429);
    });

    it('says when to retry', () => {
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('sets no cookie', () => {
      expect(blocked.headers['set-cookie']).toBeUndefined();
    });
  });

  it('rejects a forged cookie', async () => {
    const response = await request(app.getHttpServer())
      .get('/')
      .set('Cookie', `session=${Date.now() + 60_000}.deadbeef`);
    expect(response.status).toBe(302);
  });
});

describe('authConfigFromEnv', () => {
  const env = { SESSION_SECRET: 'fixed' };

  it('keeps the signing key stable for the same password', () => {
    expect(authConfigFromEnv({ ...env, APP_PASSWORD: 'a' }).secret).toBe(
      authConfigFromEnv({ ...env, APP_PASSWORD: 'a' }).secret,
    );
  });

  it('changes the signing key when the password changes', () => {
    expect(authConfigFromEnv({ ...env, APP_PASSWORD: 'a' }).secret).not.toBe(
      authConfigFromEnv({ ...env, APP_PASSWORD: 'b' }).secret,
    );
  });
});

describe('sessions', () => {
  it('accept a fresh token', () => {
    expect(isValidSession(createSession('k', 1000), 'k', 2000)).toBe(true);
  });

  it('expire', () => {
    const token = createSession('k', 1000);
    expect(isValidSession(token, 'k', 1000 + SESSION_TTL_MS + 1)).toBe(false);
  });

  it('are bound to the secret', () => {
    expect(isValidSession(createSession('k', 1000), 'other', 2000)).toBe(false);
  });
});
