import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Agency, AgencyDocument } from '../schemas/agency.schema';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { scopeToTenant } from '../tenants/tenant-scope.util';
import { UpdateBusinessInfoDto } from './dto/update-business-info.dto';
import { CloudinaryService } from '../uploads/Cloudinary.service';

@Injectable()
export class AgenciesService {
  constructor(
    @InjectModel(Agency.name) private agencyModel: Model<AgencyDocument>,
    private cloudinaryService: CloudinaryService,
  ) {}

  /** Any staff role can view — needed for reference when creating invoices (default payment terms, etc). */
  async getMine(user: AuthenticatedUser) {
    const { agencyId } = scopeToTenant(user);
    const agency = await this.agencyModel.findById(agencyId).lean();
    if (!agency) throw new NotFoundException('Agency not found');
    return agency;
  }

  /**
   * Gated by BillingAccessGuard at the controller level — owner always, or
   * a team head the owner has explicitly granted billing access to (bank
   * details and payment links are financial information, same sensitivity
   * tier as subscription management).
   */
  async updateMine(user: AuthenticatedUser, dto: UpdateBusinessInfoDto) {
    const { agencyId } = scopeToTenant(user);
    const agency = await this.agencyModel.findByIdAndUpdate(agencyId, dto, { new: true });
    if (!agency) throw new NotFoundException('Agency not found');
    return agency;
  }

  async uploadLogo(user: AuthenticatedUser, buffer: Buffer, mimeType: string) {
    const { agencyId } = scopeToTenant(user);
    const url = await this.cloudinaryService.uploadImage(buffer, mimeType, 'logos');
    const agency = await this.agencyModel.findByIdAndUpdate(agencyId, { logoUrl: url }, { new: true });
    if (!agency) throw new NotFoundException('Agency not found');
    return { logoUrl: agency.logoUrl };
  }
}