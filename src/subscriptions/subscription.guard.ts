import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Subscription,
  SubscriptionDocument,
} from '../schemas/subscription.schema';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();

    if (user?.role === 'superadmin') {
      return true;
    }

    if (!user?.agencyId) {
      throw new ForbiddenException(
        'No agency context associated with this account',
      );
    }

    const subscription = await this.subscriptionModel.findOne({
      agencyId: new Types.ObjectId(user.agencyId),
    });

    if (!subscription || subscription.status !== 'active') {
      throw new ForbiddenException(
        'This feature requires an active subscription. Visit /dashboard/billing to upgrade.',
      );
    }

    return true;
  }
}