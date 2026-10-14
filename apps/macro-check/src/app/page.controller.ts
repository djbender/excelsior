import { Controller, Get, Header, Inject } from '@nestjs/common';
import { readFileSync } from 'node:fs';

/** Location of the static page; injected so tests can point at the source copy. */
export const PAGE_PATH = Symbol('PAGE_PATH');

@Controller()
export class PageController {
  private readonly html: string;

  constructor(@Inject(PAGE_PATH) pagePath: string) {
    this.html = readFileSync(pagePath, 'utf8');
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  page(): string {
    return this.html;
  }
}
