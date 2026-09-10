import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

const PRICE_ID = "soupytag_unlock_onetime";

/** Does the signed-in person already own SoupyTag? */
export const getMyUnlock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("app_unlocks")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { unlocked: !!data };
  });

type CheckoutResult = { clientSecret: string } | { error: string };

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId: string },
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");
  const found = await stripe.customers.search({
    query: `metadata['userId']:'${options.userId}'`,
    limit: 1,
  });
  if (found.data.length) return found.data[0].id;

  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }

  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    metadata: { userId: options.userId },
  });
  return created.id;
}

export const createUnlockCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      returnUrl: z.string().url(),
      environment: z.enum(["sandbox", "live"]),
    }).parse,
  )
  .handler(async ({ context, data }): Promise<CheckoutResult> => {
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);

      const prices = await stripe.prices.list({ lookup_keys: [PRICE_ID] });
      if (!prices.data.length) return { error: "Price not configured." };
      const stripePrice = prices.data[0];

      const productId =
        typeof stripePrice.product === "string" ? stripePrice.product : stripePrice.product.id;
      const product = await stripe.products.retrieve(productId);

      const email = (context.claims as { email?: string } | undefined)?.email;
      const customerId = await resolveOrCreateCustomer(stripe, {
        email,
        userId: context.userId,
      });

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        payment_intent_data: { description: product.name },
        metadata: {
          kind: "soupytag_unlock",
          userId: context.userId,
          managed_payments: "true",
        },
        managed_payments: { enabled: true },
      } as any);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/**
 * Called when Stripe sends the buyer back to the app. Confirms the payment
 * directly with Stripe so access is granted immediately, even if the
 * background payment notification is slow.
 */
export const confirmUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().min(1).max(200),
      environment: z.enum(["sandbox", "live"]),
    }).parse,
  )
  .handler(async ({ context, data }): Promise<{ unlocked: boolean; error?: string }> => {
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);
      const paid = session.payment_status === "paid" || session.status === "complete";
      const owner = session.metadata?.userId;
      if (!paid || owner !== context.userId) return { unlocked: false };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("app_unlocks")
        .upsert(
          {
            user_id: context.userId,
            stripe_session_id: session.id,
            paid_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      return { unlocked: true };
    } catch (error) {
      return { unlocked: false, error: getStripeErrorMessage(error) };
    }
  });
