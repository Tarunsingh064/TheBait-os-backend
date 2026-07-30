import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientInvite, ClientInviteSchema } from '../schemas/client-invite.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ClientInvite.name, schema: ClientInviteSchema },
      { name: User.name, schema: UserSchema },
    ]),
    SubscriptionsModule,
  ],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
