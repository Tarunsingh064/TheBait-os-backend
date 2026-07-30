import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Agency, AgencyDocument } from '../schemas/agency.schema';
import { User, UserDocument, STAFF_ROLES } from '../schemas/user.schema';
import { Subscription, SubscriptionDocument } from '../schemas/subscription.schema';
import { ClientAgencyLink, ClientAgencyLinkDocument } from '../schemas/client-agency-link.schema';
import { PLANS } from '../subscriptions/plans.config';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Agency.name) private agencyModel: Model<AgencyDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(ClientAgencyLink.name) private clientAgencyLinkModel: Model<ClientAgencyLinkDocument>,
  ) {}

  /**
   * One row per agency with just enough context to be useful at a glance —
   * owner, staff/client counts, and current subscription state. Deliberately
   * NOT paginated yet; fine for the number of tenants a hackathon-scale app
   * will have, but worth adding pagination before this app has hundreds of agencies.
   */
  async listAgencies() {
    const agencies = await this.agencyModel.find().sort({ createdAt: -1 }).lean();

    return Promise.all(
      agencies.map(async (agency) => {
        const [owner, staffCount, clientCount, subscription] = await Promise.all([
          this.userModel.findById(agency.ownerId).select('name email').lean(),
          this.userModel.countDocuments({ agencyId: agency._id, role: { $in: STAFF_ROLES } }),
          this.clientAgencyLinkModel.countDocuments({ agencyId: agency._id }),
          this.subscriptionModel.findOne({ agencyId: agency._id }).lean(),
        ]);

        return {
          _id: agency._id,
          name: agency.name,
          slug: agency.slug,
          status: agency.status,
          createdAt: (agency as { createdAt?: Date }).createdAt,
          owner,
          staffCount,
          clientCount,
          subscription: subscription
            ? { tier: subscription.tier, status: subscription.status, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd }
            : null,
        };
      }),
    );
  }

  async getAgency(id: string) {
    const agency = await this.agencyModel.findById(id).lean();
    if (!agency) throw new NotFoundException('Agency not found');

    const [owner, staff, clientCount, subscription] = await Promise.all([
      this.userModel.findById(agency.ownerId).select('name email').lean(),
      this.userModel.find({ agencyId: agency._id, role: { $in: STAFF_ROLES } }).select('-passwordHash').lean(),
      this.clientAgencyLinkModel.countDocuments({ agencyId: agency._id }),
      this.subscriptionModel.findOne({ agencyId: agency._id }).lean(),
    ]);

    return { agency, owner, staff, clientCount, subscription };
  }

  /**
   * Owner-visible impact of this action is real: JwtStrategy checks
   * Agency.status on every authenticated request for that tenant's users
   * and rejects with 401 if suspended — this isn't just a cosmetic label.
   */
  async setAgencyStatus(id: string, status: 'active' | 'suspended') {
    const agency = await this.agencyModel.findByIdAndUpdate(id, { status }, { new: true });
    if (!agency) throw new NotFoundException('Agency not found');
    return agency;
  }

  async getPlatformStats() {
    const [totalAgencies, totalStaff, totalClientLinks, activeSubscriptions] = await Promise.all([
      this.agencyModel.countDocuments(),
      this.userModel.countDocuments({ role: { $in: STAFF_ROLES } }),
      this.clientAgencyLinkModel.countDocuments(),
      this.subscriptionModel.find({ status: 'active' }).lean(),
    ]);

    const monthlyCount = activeSubscriptions.filter((s) => s.tier === 'monthly').length;
    const yearlyCount = activeSubscriptions.filter((s) => s.tier === 'yearly').length;
    const monthlyPlan = PLANS.find((p) => p.tier === 'monthly');
    const yearlyPlan = PLANS.find((p) => p.tier === 'yearly');

    // Rough MRR estimate: yearly plans contribute their price / 12 per month.
    const estimatedMrrMinor =
      monthlyCount * (monthlyPlan?.priceMinor ?? 0) + yearlyCount * ((yearlyPlan?.priceMinor ?? 0) / 12);

    return {
      totalAgencies,
      totalStaff,
      totalClientMemberships: totalClientLinks,
      activeSubscriptions: activeSubscriptions.length,
      monthlySubscriptions: monthlyCount,
      yearlySubscriptions: yearlyCount,
      estimatedMrrMinor: Math.round(estimatedMrrMinor),
    };
  }
}
