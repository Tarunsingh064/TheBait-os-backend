import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB — generous for a logo or signature, not for arbitrary file abuse
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

@Injectable()
export class CloudinaryService {
  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  /**
   * Single upload path used by every feature that needs an image — agency
   * logos (Business Settings) and contract signature images both go
   * through this, so there's one place to change storage provider, add
   * virus scanning, etc. later rather than three copy-pasted integrations.
   */
  async uploadImage(buffer: Buffer, mimeType: string, folder: string): Promise<string> {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException('Only PNG, JPEG, WebP, or SVG images are allowed');
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image must be under 5MB');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: `the-bait/${folder}`, resource_type: 'image' },
        (error, result) => {
          if (error || !result) return reject(new BadRequestException('Image upload failed'));
          resolve(result.secure_url);
        },
      );
      uploadStream.end(buffer);
    });
  }
}