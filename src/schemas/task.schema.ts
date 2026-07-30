import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TaskDocument = Task & Document;
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

@Schema({ timestamps: true })
export class Task {
  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, index: true })
  agencyId!: Types.ObjectId;

  // A task can optionally belong to a project and/or a team — both nullable
  // so this works as a lightweight standalone to-do too, not just inside a
  // project board.
  @Prop({ type: Types.ObjectId, ref: 'Project', default: null, index: true })
  projectId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Team', default: null, index: true })
  teamId!: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ default: '', trim: true })
  description!: string;

  @Prop({ required: true, enum: ['todo', 'in_progress', 'in_review', 'done'], default: 'todo' })
  status!: TaskStatus;

  @Prop({ required: true, enum: ['low', 'medium', 'high'], default: 'medium' })
  priority!: TaskPriority;

  // Who it's assigned to — an agency staff member, never a client. Nullable:
  // an unassigned task sits in a shared backlog until someone picks it up.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  assigneeId!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
dueDate!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
