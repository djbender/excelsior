import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { InspectBatchController } from './inspect-batch.controller';
import { InspectController } from './inspect.controller';
import { PAGE_PATH, PageController } from './page.controller';

@Module({
  controllers: [InspectController, InspectBatchController, PageController],
  // The webpack build copies src/assets next to main.js.
  providers: [
    { provide: PAGE_PATH, useValue: join(__dirname, 'assets', 'index.html') },
  ],
})
export class AppModule {}
