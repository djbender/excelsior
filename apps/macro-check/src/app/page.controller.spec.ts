import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './test-app';

describe('GET /', () => {
  let app: INestApplication;
  let response: request.Response;

  beforeAll(async () => {
    app = await createTestApp();
    response = await request(app.getHttpServer()).get('/');
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200', () => {
    expect(response.status).toBe(200);
  });

  it('serves HTML', () => {
    expect(response.headers['content-type']).toMatch(/text\/html/);
  });

  it('contains a labeled file input', () => {
    expect(response.text).toMatch(
      /<label[^>]+for="file"[\s\S]*<input[^>]+type="file"/,
    );
  });

  it('contains an Inspect button', () => {
    expect(response.text).toMatch(/<button[^>]*>\s*Inspect\s*<\/button>/);
  });
});
