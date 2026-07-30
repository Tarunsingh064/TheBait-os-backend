import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Contract, ContractSchema } from '../schemas/contract.schema';
import { Agency, AgencySchema } from '../schemas/agency.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contract.name, schema: ContractSchema },
      { name: Agency.name, schema: AgencySchema },
      { name: User.name, schema: UserSchema },
    ]),
    SubscriptionsModule,
    NotificationsModule,
    UploadsModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}