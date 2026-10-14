import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MAX_INPUT_BYTES } from '@org/macro-detection';
import JSZip from 'jszip';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';

const CONTENT_TYPES =
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>' +
  '</Types>';

async function workbook(withVba: boolean): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('xl/workbook.xml', '<workbook/>');
  if (withVba) zip.file('xl/vbaProject.bin', 'binary');
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('POST /api/inspect', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('a clean workbook', () => {
    let response: request.Response;

    beforeAll(async () => {
      response = await request(app.getHttpServer())
        .post('/api/inspect')
        .attach('file', await workbook(false), 'clean.xlsx');
    });

    it('responds 200', () => {
      expect(response.status).toBe(200);
    });

    it('is accepted', () => {
      expect(response.body).toEqual({ verdict: 'accepted', reasons: [] });
    });
  });

  describe('a workbook with a VBA project', () => {
    let response: request.Response;

    beforeAll(async () => {
      response = await request(app.getHttpServer())
        .post('/api/inspect')
        .attach('file', await workbook(true), 'macro.xlsm');
    });

    it('responds 200', () => {
      expect(response.status).toBe(200);
    });

    it('is rejected', () => {
      expect(response.body.verdict).toBe('rejected');
    });

    it('reports VBA_PROJECT', () => {
      expect(
        response.body.reasons.map((r: { code: string }) => r.code),
      ).toEqual(['VBA_PROJECT']);
    });
  });

  it('responds 400 when no file is attached', async () => {
    const response = await request(app.getHttpServer()).post('/api/inspect');
    expect(response.status).toBe(400);
  });

  it('responds 400 when two files are attached', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inspect')
      .attach('file', await workbook(false), 'one.xlsx')
      .attach('file', await workbook(false), 'two.xlsx');
    expect(response.status).toBe(400);
  });

  it('responds 400 when the file is in an unexpected field', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inspect')
      .attach('upload', await workbook(false), 'one.xlsx');
    expect(response.status).toBe(400);
  });

  it('responds 413 when the file exceeds the upload limit', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/inspect')
      .attach('file', Buffer.alloc(MAX_INPUT_BYTES + 1), 'huge.xlsx');
    expect(response.status).toBe(413);
  });
});
