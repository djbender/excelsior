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

  it('lets the file input take multiple files', () => {
    expect(response.text).toMatch(/<input[^>]+type="file"[^>]+multiple/);
  });

  it('has a drop zone', () => {
    expect(response.text).toMatch(/id="dropzone"/);
  });

  it('handles the native drop event', () => {
    expect(response.text).toMatch(/addEventListener\('drop'/);
  });

  it('renders each file as its own result card', () => {
    expect(response.text).toContain("'result-card");
  });

  it('posts to the batch endpoint', () => {
    expect(response.text).toContain('/api/inspect-batch');
  });

  it('contains an Inspect button', () => {
    expect(response.text).toMatch(/<button[^>]*>\s*Inspect\s*<\/button>/);
  });
});
