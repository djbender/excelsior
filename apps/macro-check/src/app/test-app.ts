import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { PAGE_PATH } from './page.controller';

/** Boots the real AppModule, serving the page from its source location. */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PAGE_PATH)
    .useValue(join(__dirname, '..', 'assets', 'index.html'))
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
