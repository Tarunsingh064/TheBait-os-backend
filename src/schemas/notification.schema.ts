import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;
export type NotificationType =
  | 'project_updated'
  | 'invoice_created'
  | 'invoice_paid'
  | 'task_assigned'
  | 'contract_sent'
  | 'contract_signed';

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, index: true })
  agencyId: Types.ObjectId;

  // Who sees this notification — a specific user, staff or client.
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  recipientId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ['project_updated', 'invoice_created', 'invoice_paid', 'task_assigned', 'contract_sent', 'contract_signed'],
  })
  type: NotificationType;

  @Prop({ required: true, trim: true })
  message: string;

  // Loose reference to whatever this notification is about (a project ID,
  // invoice ID, task ID...) — not populated/joined, just enough for the
  // frontend to link "View" to the right page for that entity type.
  @Prop({ type: Types.ObjectId, default: null })
  relatedEntityId: Types.ObjectId | null;

  @Prop({ default: false, index: true })
  read: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
