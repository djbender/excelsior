import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  MAX_INPUT_BYTES,
  inspectSpreadsheet,
  type InspectionResult,
} from '@org/macro-detection';

export const MAX_BATCH_FILES = 20;

export interface BatchEntry extends InspectionResult {
  name: string;
}

@Controller('api')
export class InspectBatchController {
  @Post('inspect-batch')
  @HttpCode(200)
  @UseInterceptors(
    // No `storage` option: multer defaults to memory, so uploads never touch disk.
    FilesInterceptor('files', MAX_BATCH_FILES, {
      limits: { fileSize: MAX_INPUT_BYTES, files: MAX_BATCH_FILES },
    }),
  )
  async inspect(
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<{ results: BatchEntry[] }> {
    if (!files?.length) {
      throw new BadRequestException(
        `Attach between 1 and ${MAX_BATCH_FILES} files in the "files" field`,
      );
    }
    // One at a time: bounds peak CPU and memory regardless of batch size.
    const results: BatchEntry[] = [];
    for (const file of files) {
      const result = await inspectSpreadsheet(new Uint8Array(file.buffer));
      results.push({ name: file.originalname, ...result });
    }
    return { results };
  }
}
