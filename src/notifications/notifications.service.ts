import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument, NotificationType } from '../schemas/notification.schema';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { scopeToTenant } from '../tenants/tenant-scope.util';

interface CreateNotificationParams {
  agencyId: Types.ObjectId | string;
  recipientId: Types.ObjectId | string;
  type: NotificationType;
  message: string;
  relatedEntityId?: Types.ObjectId | string | null;
}

@Injectable()
export class NotificationsService {
  constructor(@InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>) {}

  /**
   * The one write path every other module calls into (project updates,
   * invoice events, task assignment, contract events...) — kept generic and
   * fire-and-forget by callers so a notification failure never blocks the
   * actual business operation it's describing.
   */
  async create(params: CreateNotificationParams) {
    return this.notificationModel.create({
      agencyId: params.agencyId,
      recipientId: params.recipientId,
      type: params.type,
      message: params.message,
      relatedEntityId: params.relatedEntityId ?? null,
    });
  }

  async findAll(user: AuthenticatedUser, unreadOnly: boolean) {
    const { agencyId } = scopeToTenant(user);
    const filter: Record<string, unknown> = { agencyId, recipientId: new Types.ObjectId(user.userId) };
    if (unreadOnly) filter.read = false;
    return this.notificationModel.find(filter).sort({ createdAt: -1 }).limit(50).lean();
  }

  async unreadCount(user: AuthenticatedUser): Promise<number> {
    const { agencyId } = scopeToTenant(user);
    return this.notificationModel.countDocuments({
      agencyId,
      recipientId: new Types.ObjectId(user.userId),
      read: false,
    });
  }

  async markRead(user: AuthenticatedUser, id: string) {
    const { agencyId } = scopeToTenant(user);
    const result = await this.notificationModel.updateOne(
      { _id: id, agencyId, recipientId: new Types.ObjectId(user.userId) },
      { read: true },
    );
    if (result.matchedCount === 0) throw new NotFoundException('Notification not found');
    return { read: true };
  }

  async markAllRead(user: AuthenticatedUser) {
    const { agencyId } = scopeToTenant(user);
    await this.notificationModel.updateMany(
      { agencyId, recipientId: new Types.ObjectId(user.userId), read: false },
      { read: true },
    );
    return { read: true };
  }
}
