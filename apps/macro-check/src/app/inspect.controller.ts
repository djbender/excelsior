import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  inspectSpreadsheet,
  type InspectionResult,
} from '@org/macro-detection';

@Controller('api')
export class InspectController {
  @Post('inspect')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  inspect(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<InspectionResult> {
    if (!file)
      throw new BadRequestException(
        'Attach exactly one file in the "file" field',
      );
    // Memory storage only: the buffer is never written to disk or logged.
    return inspectSpreadsheet(new Uint8Array(file.buffer));
  }
}
