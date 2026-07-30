import { BadRequestException, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { RazorpayService } from '../payments/razorpay.service';
import { PaymentsService } from '../payments/payments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private razorpayService: RazorpayService,
    private paymentsService: PaymentsService,
    private subscriptionsService: SubscriptionsService,
    private config: ConfigService,
  ) {}

  /**
   * Single endpoint for every Razorpay event — one-time invoice payments AND
   * recurring subscription lifecycle events both land here, verified the
   * same way, then routed by `event` name. Keeping one endpoint (rather than
   * one per concern) matches how Razorpay's dashboard webhook config works:
   * you register one URL and pick which events to send to it.
   */
  @Public()
  @Post('razorpay')
  @HttpCode(200)
  async handleWebhook(@Req() req: Request, @Headers('x-razorpay-signature') signature: string) {
    if (!signature) throw new BadRequestException('Missing signature header');

    const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;
    const webhookSecret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET') as string;

    const valid = this.razorpayService.verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!valid) throw new BadRequestException('Invalid webhook signature');

    const payload = req.body;
    const event = payload?.event;

    switch (event) {
      case 'payment.captured':
        await this.paymentsService.handlePaymentCaptured(payload.payload.payment.entity, payload);
        break;
      case 'payment.failed':
        await this.paymentsService.handlePaymentFailed(payload.payload.payment.entity, payload);
        break;
      case 'subscription.activated': {
        const sub = payload.payload.subscription.entity;
        await this.subscriptionsService.handleActivated(sub.id, new Date(sub.current_end * 1000));
        break;
      }
      case 'subscription.charged': {
        const sub = payload.payload.subscription.entity;
        await this.subscriptionsService.handleCharged(sub.id, new Date(sub.current_end * 1000));
        break;
      }
      case 'subscription.halted':
        await this.subscriptionsService.handleHalted(payload.payload.subscription.entity.id);
        break;
      case 'subscription.cancelled':
        await this.subscriptionsService.handleCancelled(payload.payload.subscription.entity.id);
        break;
      default:
        // Acknowledge and ignore anything we haven't opted into — returning
        // an error just makes Razorpay retry an event we don't care about.
        break;
    }

    return { received: true };
  }
}
