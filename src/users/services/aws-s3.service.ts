import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

export interface S3UploadResult {
  key: string;
  bucket: string;
  location: string;
  url: string;
  size: number;
}

@Injectable()
export class AwsS3Service {
  private s3Client: S3Client | null = null;
  private bucketName: string;
  private region: string;
  private isConfigured: boolean = false;

  constructor(private configService: ConfigService) {
    this.initializeS3();
  }

  private initializeS3(): void {
    try {
      const accessKeyId = this.configService.get('AWS_ACCESS_KEY_ID');
      const secretAccessKey = this.configService.get('AWS_SECRET_ACCESS_KEY');
      const region = this.configService.get('AWS_REGION') || 'ap-south-1';
      const bucketName = this.configService.get('AWS_S3_BUCKET');

      if (accessKeyId && secretAccessKey && bucketName) {
        this.s3Client = new S3Client({
          region,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });

        this.bucketName = bucketName;
        this.region = region;
        this.isConfigured = true;

        console.log(`✅ AWS S3 configured: ${bucketName} in ${region}`);
      } else {
        console.log('⚠️ AWS S3 not configured - using local file storage');
        this.isConfigured = false;
      }
    } catch (error) {
      console.error('❌ AWS S3 initialization failed:', error);
      this.isConfigured = false;
    }
  }

  isS3Available(): boolean {
    return this.isConfigured && this.s3Client !== null;
  }

  async uploadProfilePicture(
    file: Express.Multer.File, 
    userId: string
  ): Promise<S3UploadResult> {
    if (!this.isS3Available()) {
      throw new BadRequestException('S3 service not available');
    }

    try {
      // Process image
      const processedBuffer = await this.processImage(file.buffer);
      
      // Generate unique key
      const fileExtension = this.getFileExtension(file.mimetype);
      const uniqueId = uuidv4();
      const key = `profile-pictures/${userId}/${uniqueId}.${fileExtension}`;

      // Upload to S3
      const uploadCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: processedBuffer,
        ContentType: file.mimetype,
        Metadata: {
          originalName: file.originalname,
          userId: userId,
          uploadedAt: new Date().toISOString(),
        },
        // Make the object publicly readable
        ACL: 'public-read',
      });

      await this.s3Client!.send(uploadCommand);

      // Generate public URL
      const url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;

      console.log(`📸 Profile picture uploaded to S3: ${key}`);

      return {
        key,
        bucket: this.bucketName,
        location: url,
        url,
        size: processedBuffer.length,
      };

    } catch (error) {
      console.error('❌ S3 upload failed:', error);
      throw new BadRequestException('Failed to upload image to cloud storage');
    }
  }

  async deleteProfilePicture(key: string): Promise<void> {
    if (!this.isS3Available()) {
      throw new BadRequestException('S3 service not available');
    }

    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client!.send(deleteCommand);
      console.log(`🗑️ Deleted S3 object: ${key}`);

    } catch (error) {
      console.error('❌ S3 delete failed:', error);
      // Don't throw error - file might already be deleted
    }
  }

  async generatePresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (!this.isS3Available()) {
      throw new BadRequestException('S3 service not available');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client!, command, { expiresIn });
      return url;

    } catch (error) {
      console.error('❌ Failed to generate presigned URL:', error);
      throw new BadRequestException('Failed to generate image URL');
    }
  }

  private async processImage(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer)
        .resize(500, 500, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ 
          quality: 85,
          progressive: true 
        })
        .toBuffer();
    } catch (error) {
      throw new BadRequestException('Failed to process image');
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

  // Method to test S3 connectivity
  async testConnection(): Promise<boolean> {
    if (!this.isS3Available()) {
      return false;
    }

    try {
      // Try to list bucket (minimal operation)
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: 'test-connection', // This file doesn't need to exist
      });

      await this.s3Client!.send(command);
      return true;
    } catch (error) {
      // Expected to fail for non-existent key, but connection works
      if (error.name === 'NoSuchKey') {
        return true;
      }
      console.error('❌ S3 connection test failed:', error);
      return false;
    }
  }
}
