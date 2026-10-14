import { Module } from '@nestjs/common';
import { InspectController } from './inspect.controller';

@Module({
  controllers: [InspectController],
})
export class AppModule {}
