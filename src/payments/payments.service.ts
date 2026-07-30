import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument } from '../schemas/payment.schema';
import { Invoice, InvoiceDocument } from '../schemas/invoice.schema';
import { NotificationsService } from '../notifications/notifications.service';

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    private notificationsService: NotificationsService,
  ) {}

  async recordOrderCreated(params: {
    agencyId: string;
    invoiceId: string;
    razorpayOrderId: string;
    amountMinor: number;
    currency: string;
  }) {
    return this.paymentModel.create({
      agencyId: params.agencyId,
      invoiceId: params.invoiceId,
      razorpayOrderId: params.razorpayOrderId,
      amountMinor: params.amountMinor,
      currency: params.currency,
      status: 'created',
    });
  }

  /**
   * Handles `payment.captured` — the event that actually means "money has
   * moved". Idempotent by design: the unique index on razorpayPaymentId
   * means a duplicate webhook delivery (Razorpay retries on any non-2xx)
   * simply fails the second insert/update harmlessly instead of double-marking
   * the invoice paid or double-firing any downstream notification.
   */
  async handlePaymentCaptured(entity: RazorpayPaymentEntity, rawPayload: Record<string, unknown>) {
    const existing = await this.paymentModel.findOne({ razorpayPaymentId: entity.id });
    if (existing) {
      this.logger.log(`Duplicate webhook for payment ${entity.id}, ignoring`);
      return;
    }

    const payment = await this.paymentModel.findOneAndUpdate(
      { razorpayOrderId: entity.order_id, razorpayPaymentId: null },
      {
        razorpayPaymentId: entity.id,
        status: 'captured',
        lastWebhookPayload: rawPayload,
      },
      { new: true },
    );

    if (!payment) {
      this.logger.warn(`No pending Payment found for order ${entity.order_id}`);
      return;
    }

    const updatedInvoice = await this.invoiceModel.findOneAndUpdate(
      { _id: payment.invoiceId },
      { status: 'paid', paidAt: new Date() },
      { new: true },
    );

    if (updatedInvoice) {
      this.notificationsService
        .create({
          agencyId: updatedInvoice.agencyId,
          recipientId: updatedInvoice.clientId,
          type: 'invoice_paid',
          message: `Your invoice ${updatedInvoice.invoiceNumber} has been paid successfully.`,
          relatedEntityId: updatedInvoice._id,
        })
        .catch(() => undefined);
    }
  }

  async handlePaymentFailed(entity: RazorpayPaymentEntity, rawPayload: Record<string, unknown>) {
    await this.paymentModel.updateOne(
      { razorpayOrderId: entity.order_id },
      { status: 'failed', lastWebhookPayload: rawPayload },
    );
  }
}
