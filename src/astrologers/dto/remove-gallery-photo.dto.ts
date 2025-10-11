import { IsString, IsNotEmpty } from 'class-validator';

export class RemoveGalleryPhotoDto {
  @IsString({ message: 'S3 key must be a string' })
  @IsNotEmpty({ message: 'S3 key is required' })
  s3Key: string;
}
