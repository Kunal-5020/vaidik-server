import {
  Controller,
  Post,
  Delete,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from '../services/upload.service';
import { FileValidationPipe } from '../pipes/file-validation.pipe';

@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  /**
   * Upload Image
   * POST /upload/image
   * Max size: 5MB
   * Allowed: jpg, jpeg, png, webp, gif
   */
  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile(new FileValidationPipe('image'))
    file: Express.Multer.File,
  ) {
    const result = await this.uploadService.uploadImage(file);

    return {
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: result.url,
        s3Key: result.key,
        filename: result.filename,
        size: result.size,
        mimeType: result.mimeType,
      },
    };
  }

  /**
   * Upload Video
   * POST /upload/video
   * Max size: 100MB
   * Allowed: mp4, mpeg, mov, avi, mkv
   */
  @Post('video')
  @UseInterceptors(FileInterceptor('file'))
  async uploadVideo(
    @UploadedFile(new FileValidationPipe('video'))
    file: Express.Multer.File,
  ) {
    const result = await this.uploadService.uploadVideo(file);

    return {
      success: true,
      message: 'Video uploaded successfully',
      data: {
        url: result.url,
        s3Key: result.key,
        filename: result.filename,
        size: result.size,
        mimeType: result.mimeType,
      },
    };
  }

  /**
   * Upload Audio
   * POST /upload/audio
   * Max size: 10MB
   * Allowed: mp3, mpeg, wav, m4a, aac, ogg
   */
  @Post('audio')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAudio(
    @UploadedFile(new FileValidationPipe('audio'))
    file: Express.Multer.File,
  ) {
    const result = await this.uploadService.uploadAudio(file);

    return {
      success: true,
      message: 'Audio uploaded successfully',
      data: {
        url: result.url,
        s3Key: result.key,
        filename: result.filename,
        size: result.size,
        mimeType: result.mimeType,
      },
    };
  }

  /**
   * Delete File by URL
   * DELETE /upload/delete
   * Body: { url: "https://bucket.s3.region.amazonaws.com/path/to/file.jpg" }
   */
  @Delete('delete')
  @HttpCode(HttpStatus.OK)
  async deleteFile(@Body('url') url: string) {
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    const result = await this.uploadService.deleteFileByUrl(url);

    return {
      success: true,
      message: result.message,
      data: {
        deletedUrl: result.deletedUrl,
      },
    };
  }

  /**
   * Delete File by S3 Key
   * DELETE /upload/delete-by-key
   * Body: { key: "images/1234567890-abc123.jpg" }
   */
  @Delete('delete-by-key')
  @HttpCode(HttpStatus.OK)
  async deleteFileByKey(@Body('key') key: string) {
    if (!key) {
      throw new BadRequestException('S3 key is required');
    }

    const result = await this.uploadService.deleteFileByKey(key);

    return {
      success: true,
      message: result.message,
      data: {
        deletedKey: result.deletedKey,
      },
    };
  }
}
