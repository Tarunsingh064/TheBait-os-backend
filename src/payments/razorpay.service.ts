import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Razorpay = require('razorpay');

@Injectable()
export class RazorpayService {
  private client: Razorpay;

  constructor(private config: ConfigService) {
    this.client = new Razorpay({
      key_id: this.config.get<string>('RAZORPAY_KEY_ID') as string,
      key_secret: this.config.get<string>('RAZORPAY_KEY_SECRET') as string,
    });
  }

  get keyId(): string {
    return this.config.get<string>('RAZORPAY_KEY_ID') as string;
  }

  /**
   * `receipt` has a hard 40-character limit on Razorpay's side — this is the
   * exact bug already hit on The Bait (orders.create failing silently past
   * that length). Truncating a Mongo ObjectId to its last 12 hex chars keeps
   * receipts short, unique enough for reconciliation, and human-scannable.
   */
  async createOrder(params: { amountMinor: number; currency: string; invoiceId: string }) {
    const receipt = `inv_${params.invoiceId.slice(-12)}`; // always <= 16 chars, well under the 40 limit
    return this.client.orders.create({
      amount: params.amountMinor,
      currency: params.currency,
      receipt,
      notes: { invoiceId: params.invoiceId },
    });
  }

  /** Verifies the `X-Razorpay-Signature` header against the raw request body. */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string, webhookSecret: string): boolean {
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    // timingSafeEqual requires equal-length buffers, so guard the length first
    // to avoid it throwing on a malformed/short header.
    if (expected.length !== signatureHeader.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  }

  /** Verifies the checkout-side signature returned to the browser after payment (order_id|payment_id). */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  async createSubscription(params: { planId: string; totalCount: number }) {
    return this.client.subscriptions.create({
      plan_id: params.planId,
      total_count: params.totalCount,
      customer_notify: 1,
    });
  }

  async cancelSubscription(subscriptionId: string, cancelAtCycleEnd: boolean) {
    return this.client.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
  }
}
