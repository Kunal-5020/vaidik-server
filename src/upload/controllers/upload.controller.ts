import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from '../services/upload.service';

@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Upload to S3 or local storage
    const result = await this.uploadService.uploadImage(file);

    return {
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: result.url,
        s3Key: result.key,
        filename: result.filename,
      },
    };
  }
}
