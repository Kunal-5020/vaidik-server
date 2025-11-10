import {
  PipeTransform,
  Injectable,
  BadRequestException,
  ArgumentMetadata,
} from '@nestjs/common';
import type { FileType } from '../constants/file-types.constants'; // ✅ Use 'import type'
import { FILE_UPLOAD_CONFIG } from '../constants/file-types.constants';
import * as fileType from 'file-type';
import * as path from 'path';

@Injectable()
export class FileValidationPipe implements PipeTransform {
  constructor(private readonly allowedType: FileType) {}

  async transform(file: Express.Multer.File, metadata: ArgumentMetadata) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const config = FILE_UPLOAD_CONFIG[this.allowedType];

    // 1. Check file size
    if (file.size > config.maxSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${this.formatBytes(config.maxSize)}`,
      );
    }

    // 2. Check file extension
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!config.allowedExtensions.includes(fileExtension)) {
      throw new BadRequestException(
        `Invalid file extension. Allowed: ${config.allowedExtensions.join(', ')}`,
      );
    }

    // 3. Verify actual file type using magic numbers (file-type package)
    try {
      const detectedType = await fileType.fromBuffer(file.buffer);

      if (!detectedType) {
        throw new BadRequestException('Unable to detect file type');
      }

      const detectedMimeType = detectedType.mime;

      if (!config.allowedMimeTypes.includes(detectedMimeType)) {
        throw new BadRequestException(
          `Invalid file type detected: ${detectedMimeType}. Allowed: ${config.allowedMimeTypes.join(', ')}`,
        );
      }

      // Add detected type to file object for later use
      (file as any).detectedMimeType = detectedMimeType;
      (file as any).detectedExtension = detectedType.ext;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('File validation failed');
    }

    return file;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}
