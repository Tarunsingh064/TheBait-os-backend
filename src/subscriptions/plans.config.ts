export interface PlanDefinition {
  tier: 'free' | 'monthly' | 'yearly';
  name: string;
  priceMinor: number; // in paise. 0 for free. Yearly is a lump sum, not per-month.
  billingCycle: 'none' | 'monthly' | 'yearly';
  razorpayPlanIdEnvKey: string | null; // null for the free tier — no Razorpay plan needed
  features: string[];
}

export const PLANS: PlanDefinition[] = [
  {
    tier: 'free',
    name: 'Free',
    priceMinor: 0,
    billingCycle: 'none',
    razorpayPlanIdEnvKey: null,
    features: ['1 client', '1 invoice', 'Try the full payment flow once'],
  },
  {
    tier: 'monthly',
    name: 'Monthly',
    priceMinor: 299900, // ₹2,999/mo
    billingCycle: 'monthly',
    razorpayPlanIdEnvKey: 'RAZORPAY_PLAN_MONTHLY',
    features: [
      'Unlimited clients & invoices',
      'Contracts + e-sign',
      'AI meeting summaries',
      'Teams & task assignment',
      'Built-in spreadsheets',
    ],
  },
  {
    tier: 'yearly',
    name: 'Yearly',
    priceMinor: 2999900, // ₹29,999/yr — ~2 months free vs monthly
    billingCycle: 'yearly',
    razorpayPlanIdEnvKey: 'RAZORPAY_PLAN_YEARLY',
    features: ['Everything in Monthly', '~17% cheaper than paying monthly', 'Priority support'],
  },
];
