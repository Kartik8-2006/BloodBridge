import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../lib/errors.js';

export interface PaymentGateway {
  enabled: boolean;
  /** Public key id, safe to send to the browser. */
  keyId: string;
  createOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<{ id: string }>;
  /** Checks the signature Razorpay Checkout returns to the browser. */
  verifyPayment(orderId: string, paymentId: string, signature: string): boolean;
  /** Checks the X-Razorpay-Signature header against the exact raw request body. */
  verifyWebhook(rawBody: string, signature: string): boolean;
}

const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
};

interface Options {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  fetchImpl?: typeof fetch;
}

/** Razorpay Orders API over plain REST. The secret never leaves the server. */
export function createRazorpay(o: Options): PaymentGateway {
  const doFetch = o.fetchImpl ?? fetch;
  return {
    enabled: Boolean(o.keyId && o.keySecret),
    keyId: o.keyId,
    async createOrder({ amountPaise, receipt, notes }) {
      let res: Response;
      try {
        res = await doFetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${o.keyId}:${o.keySecret}`).toString('base64')}` },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
        });
      } catch {
        throw new ApiError(502, 'payment_unavailable', 'The payment service could not be reached. Try again in a moment.');
      }
      const json = (await res.json().catch(() => null)) as { id?: string } | null;
      if (!res.ok || !json?.id) throw new ApiError(502, 'payment_unavailable', 'The payment service is not available right now.');
      return { id: json.id };
    },
    verifyPayment(orderId, paymentId, signature) {
      if (!o.keySecret || !signature) return false;
      const expected = createHmac('sha256', o.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
      return safeEqualHex(expected, signature);
    },
    verifyWebhook(rawBody, signature) {
      if (!o.webhookSecret || !signature) return false;
      const expected = createHmac('sha256', o.webhookSecret).update(rawBody).digest('hex');
      return safeEqualHex(expected, signature);
    },
  };
}
