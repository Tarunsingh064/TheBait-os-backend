import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

// superadmin: you, the developer/operator — sees every agency via admin portal
// agency_owner: created & owns an Agency, full control over that tenant, only
//   one who can manage billing and generate/revoke join codes
// agency_team_head: promoted by the owner from an existing agency_member;
//   can be set as the head of a Team, same permissions as agency_member otherwise
// agency_member: invited/joined staff member inside an Agency
// client: end-client of an Agency — may belong to MULTIPLE agencies via
//   ClientAgencyLink; `agencyId` here is just their currently-active one
export type UserRole = 'superadmin' | 'agency_owner' | 'agency_member' | 'agency_team_head' | 'client';

// Roles that count as "agency staff" for permission checks — kept in one
// place so every controller/service that gates by "staff, not client" stays
// in sync when a new staff-like role is added.
export const STAFF_ROLES: UserRole[] = ['agency_owner', 'agency_member', 'agency_team_head'];

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, lowercase: true, trim: true, unique: true, index: true })
  email!: string;

  @Prop({ type: String, required: false, select: false, default: null })
  passwordHash!: string | null;

  @Prop({ type: String, required: true, enum: ['local', 'google'], default: 'local' })
  authProvider!: 'local' | 'google';

  @Prop({ type: String, unique: true, sparse: true })
googleId?: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['superadmin', 'agency_owner', 'agency_member', 'agency_team_head', 'client'],
    default: 'agency_owner',
  })
  role!: UserRole;

  // For staff (owner/member/team_head): the one agency they belong to, required.
  // For clients: their CURRENTLY ACTIVE agency for JWT/tenant-scoping purposes —
  // see ClientAgencyLink for the full list of agencies a client belongs to.
  // Null only for superadmin.
  @Prop({ type: Types.ObjectId, ref: 'Agency', default: null, index: true })
  agencyId!: Types.ObjectId | null;

  @Prop({ default: true })
  isActive!: boolean;

  // Only meaningful for agency_team_head — the owner can delegate billing
  // management to a trusted team head without making them a full owner.
  // Always true (implicitly) for agency_owner, always false for everyone else.
  @Prop({ default: false })
  hasBillingAccess!: boolean;

  @Prop({ type: Date, default: null })
  lastLoginAt!: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);