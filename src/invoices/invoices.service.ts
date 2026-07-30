import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PDFDocument, rgb, PDFFont } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as fontkit from '@pdf-lib/fontkit';
import { Invoice, InvoiceDocument } from '../schemas/invoice.schema';
import { Agency, AgencyDocument } from '../schemas/agency.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { scopeToTenant } from '../tenants/tenant-scope.util';
import { RazorpayService } from '../payments/razorpay.service';
import { PaymentsService } from '../payments/payments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';

const FREE_PLAN_INVOICE_LIMIT = 1;

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Agency.name) private agencyModel: Model<AgencyDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private razorpayService: RazorpayService,
    private paymentsService: PaymentsService,
    private subscriptionsService: SubscriptionsService,
    private notificationsService: NotificationsService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateInvoiceDto) {
    const { agencyId } = scopeToTenant(user);

    const isSubscribed = await this.subscriptionsService.isActive(agencyId.toString());
    if (!isSubscribed) {
      const invoiceCount = await this.invoiceModel.countDocuments({ agencyId });
      if (invoiceCount >= FREE_PLAN_INVOICE_LIMIT) {
        throw new ForbiddenException(
          `Free plan is limited to ${FREE_PLAN_INVOICE_LIMIT} invoice. Upgrade at /dashboard/billing to create more.`,
        );
      }
    }

    const client = await this.userModel.findOne({ _id: dto.clientId, agencyId }).lean();
    if (!client) throw new NotFoundException('Client not found');

    const agency = await this.agencyModel.findById(agencyId).lean();

    const subtotalMinor = dto.lineItems.reduce((sum, item) => sum + item.quantity * item.unitAmountMinor, 0);

    const discountType = dto.discountType ?? 'none';
    const discountValue = dto.discountValue ?? 0;
    const discountMinor =
      discountType === 'percentage'
        ? Math.round((subtotalMinor * discountValue) / 100)
        : discountType === 'fixed'
          ? discountValue
          : 0;

    const taxMinor = dto.taxMinor ?? 0;
    const totalMinor = Math.max(0, subtotalMinor - discountMinor + taxMinor);

    const invoiceNumber = await this.nextInvoiceNumber(agencyId.toString());

    // Snapshot the customer's details as they are RIGHT NOW — see the
    // CustomerSnapshot schema comment for why this must never be a live
    // reference. Per-invoice overrides in dto.customer win over the client's
    // profile defaults.
    const customer = {
      name: dto.customer?.name ?? client.name,
      company: dto.customer?.company ?? '',
      address: dto.customer?.address ?? '',
      email: dto.customer?.email ?? client.email,
      phone: dto.customer?.phone ?? '',
    };

    const invoice = await this.invoiceModel.create({
      agencyId,
      clientId: new Types.ObjectId(dto.clientId),
      invoiceNumber,
      currency: dto.currency ?? 'INR',
      customer,
      lineItems: dto.lineItems.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitAmountMinor: i.unitAmountMinor,
      })),
      subtotalMinor,
      discountType,
      discountValue,
      discountMinor,
      taxMinor,
      taxLabel: dto.taxLabel ?? '',
      totalMinor,
      // A draft is invisible to the client and un-notified until explicitly
      // sent via POST /invoices/:id/send. Without saveAsDraft, an invoice is
      // visible/payable the moment it's created — there's no separate
      // "send" step in that path — so 'sent' reflects what's actually true.
      status: dto.saveAsDraft ? 'draft' : 'sent',
      issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
      dueDate: new Date(dto.dueDate),
      paymentTerms: dto.paymentTerms ?? agency?.defaultPaymentTerms ?? 'Due on receipt',
      lateFeePolicy: dto.lateFeePolicy ?? '',
      notes: dto.notes ?? agency?.defaultNotes ?? '',
    });

    if (!dto.saveAsDraft) {
      this.notificationsService
        .create({
          agencyId,
          recipientId: dto.clientId,
          type: 'invoice_created',
          message: `A new invoice (${invoiceNumber}) has been sent to you.`,
          relatedEntityId: invoice._id,
        })
        .catch(() => undefined);
    }

    return invoice;
  }

  /**
   * Transitions a draft invoice to sent — makes it visible to the client
   * and fires the notification that creation skipped. Mirrors
   * ContractsService.send()'s pattern for the same reason: a draft
   * shouldn't announce itself until someone decides it's ready.
   */
  async send(user: AuthenticatedUser, invoiceId: string) {
    const { agencyId } = scopeToTenant(user);
    const invoice = await this.invoiceModel.findOne({ _id: invoiceId, agencyId });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'draft') {
      throw new ForbiddenException('Only draft invoices can be sent');
    }

    invoice.status = 'sent';
    await invoice.save();

    this.notificationsService
      .create({
        agencyId,
        recipientId: invoice.clientId,
        type: 'invoice_created',
        message: `A new invoice (${invoice.invoiceNumber}) has been sent to you.`,
        relatedEntityId: invoice._id,
      })
      .catch(() => undefined);

    return invoice;
  }

  /**
   * Lists invoices scoped to the caller: agency staff see every invoice
   * (including drafts) for their tenant; a client sees only invoices
   * addressed to them, and NEVER drafts — a draft doesn't exist for the
   * client until it's explicitly sent.
   */
  async findAll(user: AuthenticatedUser) {
    const { agencyId } = scopeToTenant(user);
    const filter: Record<string, unknown> = { agencyId };
    if (user.role === 'client') {
      filter.clientId = new Types.ObjectId(user.userId);
      filter.status = { $ne: 'draft' };
    }
    return this.invoiceModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findOne(user: AuthenticatedUser, invoiceId: string) {
    const { agencyId } = scopeToTenant(user);
    const invoice = await this.invoiceModel.findOne({ _id: invoiceId, agencyId }).lean();
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (user.role === 'client') {
      if (invoice.clientId.toString() !== user.userId) {
        throw new ForbiddenException('This invoice does not belong to you');
      }
      if (invoice.status === 'draft') {
        throw new ForbiddenException('This invoice has not been sent yet');
      }
    }
    return invoice;
  }

  /**
   * Creates (or reuses) a Razorpay order for this invoice so the client can
   * pay it. Reuses an existing order rather than creating a new one on every
   * page load — Razorpay orders are immutable once created, and creating a
   * fresh one each time would fragment payment history for the same invoice.
   */
  async createPaymentOrder(user: AuthenticatedUser, invoiceId: string) {
    const invoice = await this.findOne(user, invoiceId);

    if (invoice.status === 'paid') {
      throw new ForbiddenException('This invoice is already paid');
    }
    if (invoice.status === 'draft') {
      throw new ForbiddenException('Send this invoice before it can be paid');
    }

    if (invoice.razorpayOrderId) {
      return {
        orderId: invoice.razorpayOrderId,
        amount: invoice.totalMinor,
        currency: invoice.currency,
        keyId: this.razorpayService.keyId,
      };
    }

    const order = await this.razorpayService.createOrder({
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
      invoiceId: invoice._id.toString(),
    });

    await this.invoiceModel.updateOne({ _id: invoice._id }, { razorpayOrderId: order.id, status: 'sent' });

    await this.paymentsService.recordOrderCreated({
      agencyId: invoice.agencyId.toString(),
      invoiceId: invoice._id.toString(),
      razorpayOrderId: order.id,
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
    });

    return { orderId: order.id, amount: invoice.totalMinor, currency: invoice.currency, keyId: this.razorpayService.keyId };
  }

  /**
   * Full professional invoice PDF — every section from the requested spec:
   * business info, customer info, invoice meta, line items, subtotal,
   * discount, tax, grand total, payment info, payment terms, and notes.
   * Accessible to the client it belongs to AND any agency staff (owner,
   * member, team head) — enforced by findOne()'s existing role check plus
   * the controller having no additional @Roles() restriction on this route.
   *
   * Uses embedded Noto Sans (via fontkit) instead of the standard Helvetica
   * font, because Helvetica's WinAnsi encoding cannot represent the ₹
   * (Rupee) glyph produced by Intl.NumberFormat for INR amounts.
   */
  async generatePdf(user: AuthenticatedUser, invoiceId: string): Promise<Buffer> {
    const invoice = await this.findOne(user, invoiceId);
    const agency = await this.agencyModel.findById(invoice.agencyId).lean();

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit); // required before embedFont() with a custom (non-standard) font

    let page = pdfDoc.addPage([595, 842]); // A4 in points

    // Load Unicode-capable fonts that include the ₹ glyph.
    // Place NotoSans-Regular.ttf / NotoSans-Bold.ttf under src/assets/fonts/
    // and make sure your build copies that folder into dist/ (see nest-cli.json
    // "assets" config), since __dirname at runtime points into dist/.
    const regularBytes = fs.readFileSync(path.join(__dirname, '../assets/fonts/NotoSans-Regular.ttf'));
    const font = await pdfDoc.embedFont(regularBytes);
    // Using the same Regular weight for "bold" text for now — swap in a real
    // NotoSans-Bold.ttf later if you want actual bold headings.
    const bold = await pdfDoc.embedFont(regularBytes);

    const margin = 48;
    const pageWidth = 595;
    let y = 842 - margin;

    const newPageIfNeeded = (minSpace: number) => {
      if (y < margin + minSpace) {
        page = pdfDoc.addPage([595, 842]);
        y = 842 - margin;
      }
    };

    const drawText = (text: string, x: number, size: number, f: PDFFont, color = rgb(0.1, 0.11, 0.13)) => {
      page.drawText(text, { x, y, size, font: f, color });
    };

    // ---- Business Information ----
    drawText(agency?.name ?? 'Invoice', margin, 20, bold);
    y -= 20;
    if (agency?.address) {
      drawText(agency.address, margin, 9, font, rgb(0.4, 0.44, 0.5));
      y -= 13;
    }
    const contactBits = [agency?.contactEmail, agency?.contactPhone].filter(Boolean).join('  ·  ');
    if (contactBits) {
      drawText(contactBits, margin, 9, font, rgb(0.4, 0.44, 0.5));
      y -= 13;
    }
    if (agency?.taxId) {
      drawText(`Tax ID: ${agency.taxId}`, margin, 9, font, rgb(0.4, 0.44, 0.5));
      y -= 13;
    }

    // Invoice number / dates, right-aligned block
    const rightX = pageWidth - margin - 160;
    let rightY = 842 - margin;
    page.drawText(`Invoice ${invoice.invoiceNumber}`, { x: rightX, y: rightY, size: 13, font: bold });
    rightY -= 16;
    page.drawText(`Issue date: ${new Date(invoice.issueDate).toLocaleDateString()}`, {
      x: rightX,
      y: rightY,
      size: 9,
      font,
      color: rgb(0.4, 0.44, 0.5),
    });
    rightY -= 13;
    page.drawText(`Due date: ${new Date(invoice.dueDate).toLocaleDateString()}`, {
      x: rightX,
      y: rightY,
      size: 9,
      font,
      color: rgb(0.4, 0.44, 0.5),
    });

    y -= 24;

    // ---- Customer Information ----
    drawText('Billed to', margin, 10, bold, rgb(0.4, 0.44, 0.5));
    y -= 14;
    drawText(invoice.customer.name, margin, 11, bold);
    y -= 14;
    if (invoice.customer.company) {
      drawText(invoice.customer.company, margin, 9, font);
      y -= 13;
    }
    if (invoice.customer.address) {
      drawText(invoice.customer.address, margin, 9, font, rgb(0.4, 0.44, 0.5));
      y -= 13;
    }
    const customerContact = [invoice.customer.email, invoice.customer.phone].filter(Boolean).join('  ·  ');
    if (customerContact) {
      drawText(customerContact, margin, 9, font, rgb(0.4, 0.44, 0.5));
      y -= 13;
    }

    y -= 16;

    // ---- Line items table ----
    const colDescX = margin;
    const colQtyX = margin + 300;
    const colPriceX = margin + 360;
    const colTotalX = margin + 440;

    drawText('Description', colDescX, 9, bold, rgb(0.4, 0.44, 0.5));
    drawText('Qty', colQtyX, 9, bold, rgb(0.4, 0.44, 0.5));
    drawText('Unit price', colPriceX, 9, bold, rgb(0.4, 0.44, 0.5));
    drawText('Total', colTotalX, 9, bold, rgb(0.4, 0.44, 0.5));
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 16;

    const money = (minor: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: invoice.currency }).format(minor / 100);

    for (const item of invoice.lineItems) {
      newPageIfNeeded(100);
      drawText(item.description, colDescX, 9, font);
      drawText(String(item.quantity), colQtyX, 9, font);
      drawText(money(item.unitAmountMinor), colPriceX, 9, font);
      drawText(money(item.quantity * item.unitAmountMinor), colTotalX, 9, font);
      y -= 18;
    }

    y -= 8;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 20;

    // ---- Totals block, right-aligned ----
    const totalsLabelX = margin + 340;
    const totalsValueX = margin + 440;

    drawText('Subtotal', totalsLabelX, 9, font, rgb(0.4, 0.44, 0.5));
    drawText(money(invoice.subtotalMinor), totalsValueX, 9, font);
    y -= 16;

    if (invoice.discountMinor > 0) {
      const discountLabel =
        invoice.discountType === 'percentage' ? `Discount (${invoice.discountValue}%)` : 'Discount';
      drawText(discountLabel, totalsLabelX, 9, font, rgb(0.4, 0.44, 0.5));
      drawText(`-${money(invoice.discountMinor)}`, totalsValueX, 9, font);
      y -= 16;
    }

    if (invoice.taxMinor > 0) {
      drawText(invoice.taxLabel || 'Tax', totalsLabelX, 9, font, rgb(0.4, 0.44, 0.5));
      drawText(money(invoice.taxMinor), totalsValueX, 9, font);
      y -= 16;
    }

    y -= 4;
    page.drawLine({
      start: { x: totalsLabelX, y: y + 12 },
      end: { x: pageWidth - margin, y: y + 12 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    drawText('Grand total', totalsLabelX, 12, bold);
    drawText(money(invoice.totalMinor), totalsValueX, 12, bold);
    y -= 32;

    // ---- Payment Information ----
    newPageIfNeeded(160);
    drawText('Payment information', margin, 10, bold, rgb(0.4, 0.44, 0.5));
    y -= 16;
    if (agency?.bankDetails) {
      drawText(agency.bankDetails, margin, 9, font);
      y -= 13;
    }
    if (agency?.upiId) {
      drawText(`UPI: ${agency.upiId}`, margin, 9, font);
      y -= 13;
    }
    if (agency?.paymentLink) {
      drawText(`Pay online: ${agency.paymentLink}`, margin, 9, font, rgb(0.2, 0.4, 0.9));
      y -= 13;
    }
    if (!agency?.bankDetails && !agency?.upiId && !agency?.paymentLink) {
      drawText('Contact us for payment instructions.', margin, 9, font, rgb(0.4, 0.44, 0.5));
      y -= 13;
    }

    y -= 12;

    // ---- Payment Terms ----
    if (invoice.paymentTerms || invoice.lateFeePolicy) {
      newPageIfNeeded(80);
      drawText('Payment terms', margin, 10, bold, rgb(0.4, 0.44, 0.5));
      y -= 16;
      if (invoice.paymentTerms) {
        drawText(invoice.paymentTerms, margin, 9, font);
        y -= 13;
      }
      if (invoice.lateFeePolicy) {
        drawText(invoice.lateFeePolicy, margin, 9, font, rgb(0.4, 0.44, 0.5));
        y -= 13;
      }
      y -= 12;
    }

    // ---- Notes ----
    if (invoice.notes) {
      newPageIfNeeded(80);
      drawText('Notes', margin, 10, bold, rgb(0.4, 0.44, 0.5));
      y -= 16;
      for (const line of this.wrapText(invoice.notes, font, 9, pageWidth - margin * 2)) {
        newPageIfNeeded(30);
        drawText(line, margin, 9, font);
        y -= 13;
      }
    }

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }

  private wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) > maxWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = trial;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  // Count-then-format is good enough at agency scale (single-digit invoices
  // created per day), but has a theoretical race under concurrent creates.
  // If two agency members hit "create invoice" in the same millisecond,
  // revisit with a per-agency counter document + findOneAndUpdate($inc).
  private async nextInvoiceNumber(agencyId: string): Promise<string> {
    const count = await this.invoiceModel.countDocuments({ agencyId });
    return `INV-${String(count + 1).padStart(4, '0')}`;
  }
}