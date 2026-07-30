import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Meeting, MeetingSchema } from '../schemas/meeting.schema';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';
import { HuggingFaceService } from './huggingface.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Meeting.name, schema: MeetingSchema }]),
    SubscriptionsModule,
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService, HuggingFaceService],
})
export class MeetingsModule {}
