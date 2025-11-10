import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { FileType } from '../constants/file-types.constants'; // ✅ Use 'import type'
import { FILE_UPLOAD_CONFIG } from '../constants/file-types.constants';
import * as path from 'path';

@Injectable()
export class UploadService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly logger = new Logger(UploadService.name);

  constructor(private configService: ConfigService) {
    // ✅ Handle undefined values with fallback and validation
    const bucketName = this.configService.get<string>('AWS_S3_BUCKET');
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    // Validate required configuration
    if (!bucketName || !region || !accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        'AWS S3 configuration is incomplete. Please check environment variables: AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY',
      );
    }

    this.bucketName = bucketName;
    this.region = region;

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.logger.log(`S3 Client initialized for bucket: ${this.bucketName} in region: ${this.region}`);
  }

  /**
   * Upload file to S3
   * @param file - Multer file object
   * @param fileType - Type of file (image, video, audio)
   * @returns Upload result with URL and S3 key
   */
  async uploadFile(file: Express.Multer.File, fileType: FileType): Promise<{
    url: string;
    key: string;
    filename: string;
    size: number;
    mimeType: string;
  }> {
    try {
      const config = FILE_UPLOAD_CONFIG[fileType];
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const fileName = `${config.folder}/${timestamp}-${randomString}${fileExtension}`;

      this.logger.log(`Uploading ${fileType} to S3: ${fileName}`);

      // For large files (videos), use multipart upload
      if (file.size > 5 * 1024 * 1024) {
        return await this.multipartUpload(file, fileName);
      }

      // For smaller files, use simple upload
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
        },
      });

      await this.s3Client.send(command);

      const url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${fileName}`;

      this.logger.log(`File uploaded successfully: ${url}`);

      return {
        url,
        key: fileName,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      };
    } catch (error: any) {
      this.logger.error(`File upload failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Multipart upload for large files
   * @param file - Multer file object
   * @param key - S3 key/path
   */
  private async multipartUpload(file: Express.Multer.File, key: string) {
    try {
      this.logger.log(`Starting multipart upload for: ${key}`);

      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          Metadata: {
            originalName: file.originalname,
            uploadedAt: new Date().toISOString(),
          },
        },
        queueSize: 4, // concurrent parts
        partSize: 5 * 1024 * 1024, // 5MB parts
      });

      // ✅ Fixed: Handle possibly undefined progress properties
      upload.on('httpUploadProgress', (progress) => {
        if (progress.loaded !== undefined && progress.total !== undefined) {
          const percentage = Math.round((progress.loaded / progress.total) * 100);
          this.logger.log(`Upload progress: ${percentage}%`);
        }
      });

      await upload.done();

      const url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;

      this.logger.log(`Multipart upload completed: ${url}`);

      return {
        url,
        key,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      };
    } catch (error: any) {
      this.logger.error(`Multipart upload failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to upload large file: ${error.message}`);
    }
  }

  /**
   * Delete file from S3 by URL
   * @param url - Full S3 URL of the file
   * @returns Delete confirmation
   */
  async deleteFileByUrl(url: string): Promise<{
    success: boolean;
    message: string;
    deletedUrl: string;
  }> {
    try {
      // Extract S3 key from URL
      const key = this.extractKeyFromUrl(url);

      if (!key) {
        throw new BadRequestException('Invalid S3 URL provided');
      }

      this.logger.log(`Deleting file from S3: ${key}`);

      // Check if file exists before deleting
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        });
        await this.s3Client.send(headCommand);
      } catch (error: any) {
        if (error.name === 'NotFound') {
          throw new BadRequestException('File not found in S3');
        }
        throw error;
      }

      // Delete the file
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(deleteCommand);

      this.logger.log(`File deleted successfully: ${key}`);

      return {
        success: true,
        message: 'File deleted successfully',
        deletedUrl: url,
      };
    } catch (error: any) {
      this.logger.error(`File deletion failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Extract S3 key from full URL
   * Supports formats:
   * - https://bucket.s3.region.amazonaws.com/path/to/file.jpg
   * - https://s3.region.amazonaws.com/bucket/path/to/file.jpg
   */
  private extractKeyFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      // Format 1: bucket.s3.region.amazonaws.com
      if (hostname.includes('.s3.') && hostname.includes('.amazonaws.com')) {
        return urlObj.pathname.substring(1); // Remove leading slash
      }

      // Format 2: s3.region.amazonaws.com/bucket
      if (hostname.includes('s3.') && hostname.includes('.amazonaws.com')) {
        const pathParts = urlObj.pathname.split('/');
        pathParts.shift(); // Remove empty first element
        pathParts.shift(); // Remove bucket name
        return pathParts.join('/');
      }

      // Direct key if URL matches bucket
      if (hostname === `${this.bucketName}.s3.amazonaws.com`) {
        return urlObj.pathname.substring(1);
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Failed to extract key from URL: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete file from S3 by key directly
   * @param key - S3 key/path
   */
  async deleteFileByKey(key: string): Promise<{
    success: boolean;
    message: string;
    deletedKey: string;
  }> {
    try {
      this.logger.log(`Deleting file by key: ${key}`);

      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(deleteCommand);

      this.logger.log(`File deleted successfully: ${key}`);

      return {
        success: true,
        message: 'File deleted successfully',
        deletedKey: key,
      };
    } catch (error: any) {
      this.logger.error(`File deletion failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Upload image (convenience method)
   */
  async uploadImage(file: Express.Multer.File) {
    return this.uploadFile(file, 'image');
  }

  /**
   * Upload video (convenience method)
   */
  async uploadVideo(file: Express.Multer.File) {
    return this.uploadFile(file, 'video');
  }

  /**
   * Upload audio (convenience method)
   */
  async uploadAudio(file: Express.Multer.File) {
    return this.uploadFile(file, 'audio');
  }
}
