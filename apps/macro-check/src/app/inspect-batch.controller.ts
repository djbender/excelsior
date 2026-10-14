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
import { BoundedMemoryStorage } from './bounded-memory-storage';

/** Combined size of all files in one batch. Each file is still capped by MAX_INPUT_BYTES. */
export const MAX_BATCH_BYTES = 2 * MAX_INPUT_BYTES;
/**
 * Backstop, not a feature: the size cap only counts file bytes, so without this an
 * upload of thousands of empty files would still cost one inspection and one result
 * row each.
 */
export const MAX_BATCH_FILES = 500;

export interface BatchEntry extends InspectionResult {
  name: string;
}

@Controller('api')
export class InspectBatchController {
  @Post('inspect-batch')
  @HttpCode(200)
  @UseInterceptors(
    // Memory only: uploads never touch disk. The storage caps the combined size.
    FilesInterceptor('files', MAX_BATCH_FILES, {
      storage: new BoundedMemoryStorage(MAX_BATCH_BYTES),
      limits: { fileSize: MAX_INPUT_BYTES, files: MAX_BATCH_FILES },
    }),
  )
  async inspect(
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<{ results: BatchEntry[] }> {
    if (!files?.length) {
      throw new BadRequestException(
        'Attach one or more files in the "files" field',
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
