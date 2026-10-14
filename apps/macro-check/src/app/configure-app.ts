import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import helmet from 'helmet';
import { LOGIN_STYLE } from './auth/login-page';
import { PAGE_PATH } from './page.controller';

/** CSP source for an inline block: a hash of its exact text. */
function hashOf(body: string): string {
  return `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
}

function inlineHash(html: string, tag: 'script' | 'style'): string {
  const body = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(html)?.[1];
  if (body === undefined) {
    throw new Error(`index.html has no inline <${tag}> block`);
  }
  return hashOf(body);
}

/**
 * Hardening shared by the real server and the integration tests. The page's
 * inline script and style are allowed by hash, computed from the served file,
 * so editing the page can't leave a stale hash behind.
 */
export function configureApp(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  const html = readFileSync(app.get<string>(PAGE_PATH), 'utf8');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'", inlineHash(html, 'script')],
          styleSrc: ["'self'", inlineHash(html, 'style'), hashOf(LOGIN_STYLE)],
        },
      },
    }),
  );
}
