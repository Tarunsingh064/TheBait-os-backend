import { BadRequestException, Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@Roles('superadmin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getPlatformStats();
  }

  @Get('agencies')
  listAgencies() {
    return this.adminService.listAgencies();
  }

  @Get('agencies/:id')
  getAgency(@Param('id') id: string) {
    return this.adminService.getAgency(id);
  }

  @Patch('agencies/:id/status')
  setStatus(@Param('id') id: string, @Body('status') status: string) {
    if (status !== 'active' && status !== 'suspended') {
      throw new BadRequestException('status must be "active" or "suspended"');
    }
    return this.adminService.setAgencyStatus(id, status);
  }
}
