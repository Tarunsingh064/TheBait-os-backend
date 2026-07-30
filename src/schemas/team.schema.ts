import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TeamDocument = Team & Document;

@Schema({ timestamps: true })
export class Team {
  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, index: true })
  agencyId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '', trim: true })
  description: string;

  // Team members are agency staff (owner/member/team_head), never clients —
  // enforced in TeamsService when adding a member, not here at the schema level.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  memberIds: Types.ObjectId[];

  // Must be a member of this team whose role is agency_team_head — enforced
  // in TeamsService.setHead(), not here. Nullable: a team can exist without
  // a designated head yet.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  headUserId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const TeamSchema = SchemaFactory.createForClass(Team);
