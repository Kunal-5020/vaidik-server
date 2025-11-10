export const FILE_UPLOAD_CONFIG = {
  image: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
    folder: 'images',
  },
  video: {
    maxSize: 100 * 1024 * 1024, // 100MB
    allowedMimeTypes: [
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-matroska',
    ],
    allowedExtensions: ['.mp4', '.mpeg', '.mov', '.avi', '.mkv'],
    folder: 'videos',
  },
  audio: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-m4a',
      'audio/aac',
      'audio/ogg',
    ],
    allowedExtensions: ['.mp3', '.mpeg', '.wav', '.m4a', '.aac', '.ogg'],
    folder: 'audio',
  },
};

export type FileType = 'image' | 'video' | 'audio';
