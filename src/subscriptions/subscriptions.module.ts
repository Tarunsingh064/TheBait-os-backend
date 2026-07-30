import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Subscription, SubscriptionSchema } from '../schemas/subscription.schema';
import { Agency, AgencySchema } from '../schemas/agency.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionGuard } from './subscription.guard';
import { BillingAccessGuard } from './billing-access.guard';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Agency.name, schema: AgencySchema },
      { name: User.name, schema: UserSchema },
    ]),
    PaymentsModule, // for RazorpayService
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionGuard, BillingAccessGuard],
  // Exporting MongooseModule re-exports the Subscription/Agency/User model
  // tokens registered above via forFeature() — without this, any module
  // that imports SubscriptionsModule and uses `@UseGuards(SubscriptionGuard)`
  // or `@UseGuards(BillingAccessGuard)` fails, because Nest constructs a
  // fresh guard instance scoped to THAT module's own injector, which
  // otherwise has no way to resolve the models these guards depend on.
  exports: [SubscriptionsService, SubscriptionGuard, MongooseModule],
})
export class SubscriptionsModule {}
