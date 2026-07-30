import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantGuard } from '../tenants/tenant.guard';

@Controller('invoices')
@UseGuards(TenantGuard)
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Post()
  @Roles('agency_owner', 'agency_member', 'agency_team_head')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(user, dto);
  }

  // Agency staff see all their tenant's invoices; clients see only their own
  // — the role-based filtering happens inside the service, not here.
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.findAll(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoicesService.findOne(user, id);
  }

  // Any role can hit this for their own invoice — a client paying their
  // bill is exactly the intended caller, so no @Roles() restriction here.
  @Post(':id/pay')
  createPaymentOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoicesService.createPaymentOrder(user, id);
  }

  @Post(':id/send')
  @Roles('agency_owner', 'agency_member', 'agency_team_head')
  send(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoicesService.send(user, id);
  }

  // Downloadable by the client it belongs to (own invoice, enforced inside
  // findOne) AND any agency staff (owner, member, team head) — no @Roles()
  // restriction here since both sides of the invoice should be able to
  // download it.
  @Get(':id/pdf')
  async downloadPdf(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const invoice = await this.invoicesService.findOne(user, id);
    const buffer = await this.invoicesService.generatePdf(user, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.send(buffer);
  }
}