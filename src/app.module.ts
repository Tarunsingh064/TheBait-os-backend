import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InviteCodesModule } from './invite-codes/invite-codes.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { ClientsModule } from './clients/clients.module';
import { ProjectsModule } from './projects/projects.module';
import { TeamsModule } from './teams/teams.module';
import { TasksModule } from './tasks/tasks.module';
import { SpreadsheetsModule } from './spreadsheets/spreadsheets.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { ContractsModule } from './contracts/contracts.module';
import { MeetingsModule } from './meetings/meetings.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AgenciesModule } from './agencies/agencies.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGODB_URI as string),
    // Generous global default — tune per-route with @Throttle() for sensitive
    // endpoints like /auth/login. The Bait's earlier 3 req/min GLOBAL limit
    // is the mistake to avoid: that setting belongs on specific routes, not everywhere.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    UsersModule,
    InviteCodesModule,
    InvoicesModule,
    PaymentsModule,
    ClientsModule,
    ProjectsModule,
    TeamsModule,
    TasksModule,
    SpreadsheetsModule,
    NotificationsModule,
    AdminModule,
    ContractsModule,
    MeetingsModule,
    SubscriptionsModule,
    WebhooksModule,
    AgenciesModule,
    UploadsModule,
  ],
  providers: [
    // Order matters: rate limit -> authenticate -> authorize by role
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
