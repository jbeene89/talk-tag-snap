import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

const PRICE_ID = "wrapkit_basic_99";

type CheckoutResult = { clientSecret: string } | { error: string };

/**
 * Public: create the Stripe Embedded Checkout session for an already-inserted order row.
 * Anonymous customers can call this — no auth required.
 */
export const createOrderCheckout = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      orderId: z.string().uuid(),
      returnUrl: z.string().url(),
      environment: z.enum(["sandbox", "live"]),
    }).parse
  )
  .handler(async ({ data }): Promise<CheckoutResult> => {
    try {
      // Look up the order via admin client (bypasses RLS — this is server-only).
      const { data: order, error } = await supabaseAdmin
        .from("orders")
        .select("id, customer_email, app_name, status")
        .eq("id", data.orderId)
        .single();

      if (error || !order) {
        return { error: "Order not found." };
      }
      if (order.status !== "pending_payment") {
        return { error: "This order is already being processed." };
      }

      const env = data.environment as StripeEnv;
      const stripe = createStripeClient(env);

      const prices = await stripe.prices.list({ lookup_keys: [PRICE_ID] });
      if (!prices.data.length) return { error: "Price not configured." };
      const stripePrice = prices.data[0];

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer_email: (order.customer_email as string) ?? undefined,
        payment_intent_data: {
          description: `WrapKit Cloud — ${order.app_name}`,
        },
        metadata: {
          order_id: order.id as string,
          managed_payments: "true",
        },
        // Stripe SDK types lag behind the API; managed_payments is supported.
        managed_payments: { enabled: true },
      } as any);

      // Stamp the order with the session id for cross-reference in the admin.
      await supabaseAdmin
        .from("orders")
        .update({ stripe_session_id: session.id })
        .eq("id", order.id);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/* ============================ ADMIN-ONLY ============================ */

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

/**
 * Bootstrap: if there are zero admins in the system, grant the calling user
 * admin. This lets the very first signup claim the dashboard, after which
 * no one else can self-promote.
 */
export const claimAdminIfFirstUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { count, error } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 0) return { granted: false };
    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (insertError) throw new Error(insertError.message);
    return { granted: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Sign URLs for icons so admin can preview them.
    const ordersWithIcons = await Promise.all(
      (data ?? []).map(async (order: any) => {
        let iconUrl: string | null = null;
        if (order.icon_storage_path) {
          const { data: signed } = await supabaseAdmin.storage
            .from("order-icons")
            .createSignedUrl(order.icon_storage_path, 60 * 60);
          iconUrl = signed?.signedUrl ?? null;
        }
        return { ...order, icon_signed_url: iconUrl };
      })
    );
    return { orders: ordersWithIcons };
  });

export const updateOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      orderId: z.string().uuid(),
      status: z
        .enum(["pending_payment", "paid", "in_progress", "delivered", "cancelled"])
        .optional(),
      aab_download_url: z.string().url().nullable().optional(),
      admin_notes: z.string().max(2000).nullable().optional(),
    }).parse
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "delivered") patch.delivered_at = new Date().toISOString();
    }
    if (data.aab_download_url !== undefined) patch.aab_download_url = data.aab_download_url;
    if (data.admin_notes !== undefined) patch.admin_notes = data.admin_notes;

    const { error } = await supabaseAdmin
      .from("orders")
      .update(patch as any)
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
