import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Team, TeamSchema } from '../schemas/team.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';


@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Team.name, schema: TeamSchema },
      { name: User.name, schema: UserSchema },
    ]),
    SubscriptionsModule
  ],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
