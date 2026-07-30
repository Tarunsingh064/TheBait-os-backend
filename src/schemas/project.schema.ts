import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProjectDocument = Project & Document;
export type ProjectStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';

@Schema({ timestamps: true })
export class Project {
  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, index: true })
  agencyId!: Types.ObjectId;

  // Optional — an agency can run an internal project with no client attached.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  clientId!: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: '', trim: true })
  description!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled'],
    default: 'not_started',
  })
  status!: ProjectStatus;

  @Prop({ type: Date, default: null })
  deadline!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
