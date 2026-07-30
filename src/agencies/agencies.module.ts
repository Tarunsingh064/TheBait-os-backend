import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Agency, AgencySchema } from '../schemas/agency.schema';
import { AgenciesService } from './agencies.service';
import { AgenciesController } from './agencies.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Agency.name, schema: AgencySchema }]),
    // Needed so BillingAccessGuard (used on PATCH /agencies/me) can resolve
    // its User model dependency here — SubscriptionsModule re-exports
    // MongooseModule for exactly this reason. See the note in
    // subscriptions.module.ts for why this pattern is required.
    SubscriptionsModule,
    UploadsModule,
  ],
  controllers: [AgenciesController],
  providers: [AgenciesService],
})
export class AgenciesModule {}