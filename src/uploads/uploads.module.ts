import { Module } from '@nestjs/common';
import { CloudinaryService } from './Cloudinary.service';

@Module({
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class UploadsModule {}