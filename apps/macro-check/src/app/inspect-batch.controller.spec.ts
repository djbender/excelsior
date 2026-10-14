import type { INestApplication } from '@nestjs/common';
import { MAX_INPUT_BYTES } from '@djbender/macro-detection';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_BATCH_FILES, MAX_BATCH_BYTES } from './inspect-batch.controller';
import { createTestApp } from './test-app';
import { workbook } from './test-workbook';

interface BatchEntry {
  name: string;
  verdict: string;
  reasons: { code: string }[];
}

describe('POST /api/inspect-batch', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('a clean workbook, a macro workbook and plain text', () => {
    let response: request.Response;

    beforeAll(async () => {
      response = await request(app.getHttpServer())
        .post('/api/inspect-batch')
        .attach('files', await workbook(false), 'clean.xlsx')
        .attach('files', await workbook(true), 'macro.xlsm')
        .attach('files', Buffer.from('hello'), 'notes.txt');
    });

    it('responds 200', () => {
      expect(response.status).toBe(200);
    });

    it('returns one result per file, in upload order', () => {
      expect(response.body.results.map((r: BatchEntry) => r.name)).toEqual([
        'clean.xlsx',
        'macro.xlsm',
        'notes.txt',
      ]);
    });

    it('gives each file its own verdict', () => {
      expect(response.body.results.map((r: BatchEntry) => r.verdict)).toEqual([
        'accepted',
        'rejected',
        'rejected',
      ]);
    });

    it('gives each file its own reason codes', () => {
      expect(
        response.body.results.map((r: BatchEntry) =>
          r.reasons.map((reason) => reason.code),
        ),
      ).toEqual([[], ['VBA_PROJECT'], ['NOT_A_SPREADSHEET']]);
    });
  });

  it('responds 400 when no files are attached', async () => {
    const response = await request(app.getHttpServer()).post(
      '/api/inspect-batch',
    );
    expect(response.status).toBe(400);
  });

  it('responds 400 when the files are in an unexpected field', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inspect-batch')
      .attach('upload', await workbook(false), 'one.xlsx');
    expect(response.status).toBe(400);
  });

  describe('30 small files, more than the old 20-file limit', () => {
    let response: request.Response;

    beforeAll(async () => {
      const clean = await workbook(false);
      let req = request(app.getHttpServer()).post('/api/inspect-batch');
      for (let i = 0; i < 30; i++) {
        req = req.attach('files', clean, `file-${i}.xlsx`);
      }
      response = await req;
    });

    it('responds 200', () => {
      expect(response.status).toBe(200);
    });

    it('returns a result for every file', () => {
      expect(response.body.results).toHaveLength(30);
    });
  });

  describe('files that together reach exactly the combined size limit', () => {
    it('responds 200', async () => {
      // Two halves of the budget. Each must also fit the per-file limit, so this
      // fails loudly (413) if the two constants ever stop lining up.
      const half = MAX_BATCH_BYTES / 2;
      const response = await request(app.getHttpServer())
        .post('/api/inspect-batch')
        .attach('files', Buffer.alloc(half), 'a.xlsx')
        .attach('files', Buffer.alloc(half), 'b.xlsx');
      expect(response.status).toBe(200);
    });
  });

  it('responds 413 when the files together are one byte over the combined limit', async () => {
    const half = MAX_BATCH_BYTES / 2;
    const response = await request(app.getHttpServer())
      .post('/api/inspect-batch')
      .attach('files', Buffer.alloc(half), 'a.xlsx')
      .attach('files', Buffer.alloc(half), 'b.xlsx')
      .attach('files', Buffer.alloc(1), 'c.xlsx');
    expect(response.status).toBe(413);
  });

  it(`responds 400 when more than ${MAX_BATCH_FILES} files are attached, whatever their size`, async () => {
    let req = request(app.getHttpServer()).post('/api/inspect-batch');
    for (let i = 0; i <= MAX_BATCH_FILES; i++) {
      req = req.attach('files', Buffer.alloc(1), `file-${i}.xlsx`);
    }
    const response = await req;
    expect(response.status).toBe(400);
  });

  it('responds 413 when any file exceeds the upload limit', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inspect-batch')
      .attach('files', await workbook(false), 'ok.xlsx')
      .attach('files', Buffer.alloc(MAX_INPUT_BYTES + 1), 'huge.xlsx');
    expect(response.status).toBe(413);
  });
});
