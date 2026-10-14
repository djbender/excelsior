import { PayloadTooLargeException } from '@nestjs/common';
import type { StorageEngine } from 'multer';

/**
 * multer storage that keeps uploads in memory (never on disk) and caps the combined
 * size of all files in one request.
 *
 * multer only limits each file on its own, so a batch could otherwise buffer without
 * bound. This counts bytes as they stream in and fails the request with 413 the moment
 * the running total passes the cap, instead of after everything has been buffered.
 */
export class BoundedMemoryStorage implements StorageEngine {
  // Keyed by the request object, which is all we need from it.
  private readonly receivedBytes = new WeakMap<object, number>();

  constructor(private readonly maxTotalBytes: number) {}

  _handleFile(
    req: object,
    file: Express.Multer.File,
    callback: (error?: unknown, info?: Partial<Express.Multer.File>) => void,
  ): void {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;

    file.stream.on('data', (chunk: Buffer) => {
      if (failed) return;
      const total = (this.receivedBytes.get(req) ?? 0) + chunk.length;
      this.receivedBytes.set(req, total);
      if (total > this.maxTotalBytes) {
        failed = true;
        chunks.length = 0;
        callback(
          new PayloadTooLargeException(
            `The files together exceed ${this.maxTotalBytes} bytes`,
          ),
        );
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    file.stream.on('error', (error) => {
      if (failed) return;
      failed = true;
      callback(error);
    });
    file.stream.on('end', () => {
      if (failed) return;
      callback(null, { buffer: Buffer.concat(chunks), size });
    });
  }

  _removeFile(
    _req: object,
    _file: Express.Multer.File,
    callback: (error: Error | null) => void,
  ): void {
    // Nothing was written anywhere, so there is nothing to remove.
    callback(null);
  }
}
