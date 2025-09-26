import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileTypeFromBuffer } from 'file-type';
import { AwsS3Service } from './aws-s3.service';

export interface UploadResult {
  filename: string;
  originalName: string;
  path?: string; // For local storage
  s3Key?: string; // For S3 storage
  size: number;
  mimetype: string;
  url: string;
  storageType: 'local' | 's3';
}

@Injectable()
export class FileUploadService {
  private readonly uploadDir: string;
  private readonly maxFileSize = 5 * 1024 * 1024; // 5MB
  private readonly allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  private readonly imageQuality = 85;
  private readonly maxWidth = 500;
  private readonly maxHeight = 500;

  constructor(
    private configService: ConfigService,
    private awsS3Service: AwsS3Service,
  ) {
    this.uploadDir = path.join(process.cwd(), 'uploads', 'profiles');
    this.ensureUploadDirectory();
  }

  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
      console.log(`📁 Created upload directory: ${this.uploadDir}`);
    }
  }

  async uploadProfilePicture(file: Express.Multer.File, userId: string): Promise<UploadResult> {
    try {
      // Validate file
      await this.validateFile(file);

      // Try S3 first, fallback to local
      if (this.awsS3Service.isS3Available()) {
        return await this.uploadToS3(file, userId);
      } else {
        console.log('📝 S3 not available, using local storage');
        return await this.uploadToLocal(file, userId);
      }

    } catch (error) {
      console.error('❌ File upload error:', error);
      throw new BadRequestException(error.message || 'Failed to upload profile picture');
    }
  }

  private async uploadToS3(file: Express.Multer.File, userId: string): Promise<UploadResult> {
    try {
      const s3Result = await this.awsS3Service.uploadProfilePicture(file, userId);

      return {
        filename: s3Result.key.split('/').pop() || 'unknown',
        originalName: file.originalname,
        s3Key: s3Result.key,
        size: s3Result.size,
        mimetype: file.mimetype,
        url: s3Result.url,
        storageType: 's3',
      };

    } catch (error) {
      console.log('❌ S3 upload failed, falling back to local storage:', error.message);
      return await this.uploadToLocal(file, userId);
    }
  }

  private async uploadToLocal(file: Express.Multer.File, userId: string): Promise<UploadResult> {
    // Generate unique filename
    const timestamp = Date.now();
    const fileExt = this.getFileExtension(file.mimetype);
    const filename = `profile_${userId}_${timestamp}.${fileExt}`;
    const filepath = path.join(this.uploadDir, filename);

    // Process and optimize image
    const processedBuffer = await this.processImage(file.buffer);

    // Save file
    await fs.writeFile(filepath, processedBuffer);

    // Generate URL
    const baseUrl = this.configService.get('BASE_URL') || 'http://localhost:3001';
    const url = `${baseUrl}/uploads/profiles/${filename}`;

    console.log(`📸 Profile picture uploaded locally: ${filename} (${processedBuffer.length} bytes)`);

    return {
      filename,
      originalName: file.originalname,
      path: filepath,
      size: processedBuffer.length,
      mimetype: file.mimetype,
      url,
      storageType: 'local',
    };
  }

  async deleteProfilePicture(filename: string, s3Key?: string): Promise<void> {
    try {
      if (s3Key) {
        // Delete from S3
        await this.awsS3Service.deleteProfilePicture(s3Key);
      } else {
        // Delete from local storage
        const filepath = path.join(this.uploadDir, filename);
        await this.deleteLocalFile(filepath);
      }
    } catch (error) {
      console.error('❌ Failed to delete profile picture:', error);
    }
  }

  private async deleteLocalFile(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
      console.log(`🗑️ Deleted local file: ${filepath}`);
    } catch (error) {
      console.error('❌ Failed to delete local file:', error);
    }
  }

  private async validateFile(file: Express.Multer.File): Promise<void> {
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(`File size too large. Maximum size is ${this.maxFileSize / 1024 / 1024}MB`);
    }

    const fileType = await fileTypeFromBuffer(file.buffer);
    if (!fileType || !this.allowedMimeTypes.includes(fileType.mime)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP images are allowed');
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Empty file received');
    }
  }

  private async processImage(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer)
        .resize(this.maxWidth, this.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: this.imageQuality })
        .toBuffer();
    } catch (error) {
      throw new BadRequestException('Failed to process image. Please ensure it\'s a valid image file');
    }
  }

  private getFileExtension(mimetype: string): string {
    const mimeToExt = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    return mimeToExt[mimetype] || 'jpg';
  }

  // Get storage info for debugging
  getStorageInfo(): any {
    return {
      s3Available: this.awsS3Service.isS3Available(),
      localUploadDir: this.uploadDir,
      maxFileSize: this.maxFileSize,
      allowedTypes: this.allowedMimeTypes,
    };
  }
}
