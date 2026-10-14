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
  MAX_INPUT_BYTES,
  inspectSpreadsheet,
  type InspectionResult,
} from '@djbender/macro-detection';

@Controller('api')
export class InspectController {
  @Post('inspect')
  @HttpCode(200)
  @UseInterceptors(
    // No `storage` option: multer defaults to memory, so uploads never touch disk.
    FileInterceptor('file', {
      limits: { fileSize: MAX_INPUT_BYTES, files: 1 },
    }),
  )
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
