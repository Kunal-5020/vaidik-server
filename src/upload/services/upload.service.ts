// import { Injectable } from '@nestjs/common';
// import * as AWS from 'aws-sdk';
// import { ConfigService } from '@nestjs/config';

// @Injectable()
// export class UploadService {
//   private s3: AWS.S3;

//   constructor(private configService: ConfigService) {
//     this.s3 = new AWS.S3({
//       accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
//       secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
//       region: this.configService.get('AWS_REGION'),
//     });
//   }

//   async uploadImage(file: Express.Multer.File) {
//     const timestamp = Date.now();
//     const filename = `profiles/${timestamp}-${file.originalname}`;

//     const params = {
//       Bucket: this.configService.get('AWS_S3_BUCKET'),
//       Key: filename,
//       Body: file.buffer,
//       ContentType: file.mimetype,
//       ACL: 'public-read',
//     };

//     const result = await this.s3.upload(params).promise();

//     return {
//       url: result.Location,
//       key: result.Key,
//       filename: file.originalname,
//     };
//   }
// }

import { Injectable } from '@nestjs/common';
// import * as AWS from 'aws-sdk'; // ✅ Commented out
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UploadService {
  // private s3: AWS.S3; // ✅ Commented out

  constructor(private configService: ConfigService) {
    // ✅ Commented out AWS initialization
    // this.s3 = new AWS.S3({
    //   accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
    //   secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
    //   region: this.configService.get('AWS_REGION'),
    // });
  }

  async uploadImage(file: Express.Multer.File) {
    console.log('📸 Mock Upload - File received:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });

    // ✅ Return static placeholder image URL
    const staticImageUrl = 'https://ui-avatars.com/api/?name=' + 
      encodeURIComponent(file.originalname) + 
      '&size=200&background=5b2b84&color=fff';

    // Alternative static images you can use:
    // 'https://via.placeholder.com/200/5b2b84/FFFFFF?text=Profile'
    // 'https://i.pravatar.cc/200'
    // 'https://robohash.org/' + Date.now() + '.png'

    console.log('✅ Mock Upload - Returning static URL:', staticImageUrl);

    return {
      url: staticImageUrl,
      key: `profiles/mock-${Date.now()}-${file.originalname}`,
      filename: file.originalname,
    };

    // ✅ Original AWS code (commented out for later use)
    /*
    const timestamp = Date.now();
    const filename = `profiles/${timestamp}-${file.originalname}`;

    const params = {
      Bucket: this.configService.get('AWS_S3_BUCKET'),
      Key: filename,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read',
    };

    const result = await this.s3.upload(params).promise();

    return {
      url: result.Location,
      key: result.Key,
      filename: file.originalname,
    };
    */
  }
}
