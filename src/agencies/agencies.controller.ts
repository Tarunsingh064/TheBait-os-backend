import {
  Body, Controller, Get, Patch, Post, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AgenciesService } from './agencies.service';
import { UpdateBusinessInfoDto } from './dto/update-business-info.dto';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { TenantGuard } from '../tenants/tenant.guard';
import { BillingAccessGuard } from '../subscriptions/billing-access.guard';

@Controller('agencies')
@UseGuards(TenantGuard)
export class AgenciesController {
  constructor(private agenciesService: AgenciesService) {}

  @Get('me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.agenciesService.getMine(user);
  }

  @Patch('me')
  @UseGuards(BillingAccessGuard)
  updateMine(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateBusinessInfoDto) {
    return this.agenciesService.updateMine(user, dto);
  }

  @Post('me/logo')
  @UseGuards(BillingAccessGuard)
  @UseInterceptors(FileInterceptor('logo')) // 'logo' must match the form field name the client sends
  uploadLogo(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.agenciesService.uploadLogo(user, file.buffer, file.mimetype);
  }
}