import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { SignContractDto } from './dto/sign-contract.dto';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantGuard } from '../tenants/tenant.guard';
import { SubscriptionGuard } from '../subscriptions/subscription.guard';

@Controller('contracts')
@UseGuards(TenantGuard,SubscriptionGuard)
export class ContractsController {
  constructor(private contractsService: ContractsService) {}

  @Post()
  @Roles('agency_owner', 'agency_member', 'agency_team_head')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateContractDto) {
    return this.contractsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.findAll(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contractsService.findOne(user, id);
  }

  @Post(':id/send')
  @Roles('agency_owner', 'agency_member', 'agency_team_head')
  send(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contractsService.send(user, id);
  }

  @Post(':id/sign')
  @Roles('client')
  sign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SignContractDto,
    @Req() req: Request,
  ) {
    return this.contractsService.sign(user, id, dto, req.ip ?? 'unknown');
  }

  @Get(':id/pdf')
  async downloadPdf(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const buffer = await this.contractsService.generatePdf(user, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contract-${id}.pdf"`);
    res.send(buffer);
  }
}
