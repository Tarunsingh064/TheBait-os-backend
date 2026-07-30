import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Agency, AgencySchema } from '../schemas/agency.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Subscription, SubscriptionSchema } from '../schemas/subscription.schema';
import { ClientAgencyLink, ClientAgencyLinkSchema } from '../schemas/client-agency-link.schema';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Agency.name, schema: AgencySchema },
      { name: User.name, schema: UserSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: ClientAgencyLink.name, schema: ClientAgencyLinkSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
