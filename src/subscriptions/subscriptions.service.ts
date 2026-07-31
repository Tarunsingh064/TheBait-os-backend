import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Subscription, SubscriptionDocument } from '../schemas/subscription.schema';
import { Agency, AgencyDocument } from '../schemas/agency.schema';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { RazorpayService } from '../payments/razorpay.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { PLANS } from './plans.config';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(Agency.name) private agencyModel: Model<AgencyDocument>,
    private razorpayService: RazorpayService,
    private config: ConfigService,
  ) {}

  listPlans() {
    return PLANS.map(({ tier, name, priceMinor, billingCycle, features }) => ({
      tier,
      name,
      priceMinor,
      billingCycle,
      features,
    }));
  }

  /**
   * The one thing other modules need from Subscriptions — kept as a single
   * boolean check so Clients/Invoices/Contracts/Meetings never have to know
   * about Subscription's internal shape, just "yes/no, are they paying."
   */
   async isActive(agencyId: string): Promise<boolean> {
    const sub = await this.subscriptionModel
      .findOne({ agencyId: new Types.ObjectId(agencyId) })
      .lean();
    return sub?.status === 'active';
  }

  /**
   * Only the agency_owner can start a subscription — billing decisions
   * shouldn't be a normal team member's call. Enforced in the controller
   * via @Roles(), not repeated here. There's no "subscribe to free" path —
   * free is just the state of having no Subscription document at all.
   */
  async create(user: AuthenticatedUser, dto: CreateSubscriptionDto) {
    if (!user.agencyId) throw new BadRequestException('No agency context');

    const existing = await this.subscriptionModel.findOne({ agencyId: user.agencyId });
    if (existing && existing.status !== 'cancelled') {
      throw new ConflictException('This agency already has an active or pending subscription');
    }

    const plan = PLANS.find((p) => p.tier === dto.tier);
    if (!plan || !plan.razorpayPlanIdEnvKey) {
      throw new BadRequestException('Unknown or non-subscribable plan tier');
    }

    const razorpayPlanId = this.config.get<string>(plan.razorpayPlanIdEnvKey);
    if (!razorpayPlanId) {
      throw new BadRequestException(`Plan ${dto.tier} is not configured — missing ${plan.razorpayPlanIdEnvKey}`);
    }

    // Monthly renews every month, so 120 cycles ≈ 10 years of "until
    // cancelled." Yearly renews once a year, so the same 10-year horizon is
    // only 10 cycles.
    const totalCount = dto.tier === 'yearly' ? 10 : 120;

    const rzpSubscription = await this.razorpayService.createSubscription({
      planId: razorpayPlanId,
      totalCount,
    });

    const record = existing
      ? await this.subscriptionModel.findOneAndUpdate(
          { agencyId: user.agencyId },
          {
            tier: dto.tier,
            razorpayPlanId,
            razorpaySubscriptionId: rzpSubscription.id,
            status: 'created',
            cancelAtPeriodEnd: false,
          },
          { new: true },
        )
      : await this.subscriptionModel.create({
          agencyId: new Types.ObjectId(user.agencyId),
          tier: dto.tier,
          razorpayPlanId,
          razorpaySubscriptionId: rzpSubscription.id,
          status: 'created',
        });

    return {
      subscriptionId: rzpSubscription.id,
      keyId: this.razorpayService.keyId,
      record,
    };
  }

  async getCurrent(user: AuthenticatedUser) {
    if (!user.agencyId) throw new BadRequestException('No agency context');
    const sub = await this.subscriptionModel.findOne({ agencyId: user.agencyId }).lean();
    return sub; // null is a valid, expected response — "no subscription yet"
  }

  async cancel(user: AuthenticatedUser) {
    if (!user.agencyId) throw new BadRequestException('No agency context');
    const sub = await this.subscriptionModel.findOne({ agencyId: user.agencyId });
    if (!sub) throw new NotFoundException('No subscription found for this agency');

    // cancel_at_cycle_end=1: let the agency keep access through what they've
    // already paid for, rather than yanking it immediately mid-cycle.
    await this.razorpayService.cancelSubscription(sub.razorpaySubscriptionId, true);
    sub.cancelAtPeriodEnd = true;
    await sub.save();
    return sub;
  }

  // --- Webhook-driven state transitions below. Never called directly from
  // a controller — only from WebhooksController after signature verification. ---

  async handleActivated(razorpaySubscriptionId: string, currentPeriodEnd: Date) {
    const sub = await this.subscriptionModel.findOneAndUpdate(
      { razorpaySubscriptionId },
      { status: 'active', currentPeriodEnd },
      { new: true },
    );
    if (sub) await this.agencyModel.updateOne({ _id: sub.agencyId }, { status: 'active' });
  }

  async handleCharged(razorpaySubscriptionId: string, currentPeriodEnd: Date) {
    // A successful renewal charge — same effect as activation, just recurring.
    await this.handleActivated(razorpaySubscriptionId, currentPeriodEnd);
  }

  async handleHalted(razorpaySubscriptionId: string) {
    // Razorpay halts a subscription after repeated charge failures — this is
    // the "card declined too many times" state, distinct from a deliberate cancel.
    const sub = await this.subscriptionModel.findOneAndUpdate(
      { razorpaySubscriptionId },
      { status: 'halted' },
      { new: true },
    );
    if (sub) await this.agencyModel.updateOne({ _id: sub.agencyId }, { status: 'past_due' });
  }

  async handleCancelled(razorpaySubscriptionId: string) {
    const sub = await this.subscriptionModel.findOneAndUpdate(
      { razorpaySubscriptionId },
      { status: 'cancelled' },
      { new: true },
    );
    if (sub) await this.agencyModel.updateOne({ _id: sub.agencyId }, { status: 'suspended' });
  }
}
