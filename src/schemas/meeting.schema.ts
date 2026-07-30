import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MeetingDocument = Meeting & Document;
export type MeetingStatus = 'pending' | 'processing' | 'completed' | 'failed';

@Schema({ _id: false })
export class ActionItem {
  @Prop({ required: true })
  description: string;

  @Prop({ type: String, default: null })
  owner: string | null;

  @Prop({ type: String, default: null })
  dueDate: string | null;
}

@Schema({ timestamps: true })
export class Meeting {
  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, index: true })
  agencyId: Types.ObjectId;

  // Optional — a meeting can be tied to a client, or purely internal.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  clientId: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  title: string;

  // Raw pasted transcript — audio-to-text is a separate future step
  // (e.g. Whisper/AssemblyAI) that would populate this same field.
  @Prop({ required: true })
  transcript: string;

  @Prop({ type: String, required: true, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' })
  status: MeetingStatus;

  @Prop({ type: String, default: null })
  summaryOverview: string | null;

  @Prop({ type: [ActionItem], default: [] })
  actionItems: ActionItem[];

  @Prop({ type: [String], default: [] })
  decisions: string[];

  @Prop({ type: String, default: null })
  failureReason: string | null;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);
