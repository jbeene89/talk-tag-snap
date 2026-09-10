import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

async function handleTransactionCompleted(transaction: any) {
  // The Lovable payments gateway forwards Stripe events; for one-time payment
  // we expect either a Stripe checkout.session.completed or a synthesized
  // transaction.completed. Both carry session id + metadata.
  const sessionId: string | undefined =
    transaction?.id ?? transaction?.session_id ?? transaction?.checkout_session_id;
  const orderId: string | undefined =
    transaction?.metadata?.order_id ?? transaction?.metadata?.orderId;

  if (!orderId && !sessionId) {
    console.error("Webhook missing order_id and session id", transaction);
    return;
  }

  const filter = orderId
    ? { column: "id", value: orderId }
    : { column: "stripe_session_id", value: sessionId! };

  const { error } = await supabaseAdmin
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      ...(sessionId ? { stripe_session_id: sessionId } : {}),
    })
    .eq(filter.column, filter.value);

  if (error) console.error("Failed to mark order paid:", error);
}

async function handleAppUnlock(session: any) {
  const userId: string | undefined = session?.metadata?.userId;
  if (!userId) {
    console.error("Unlock webhook missing userId", session?.id);
    return;
  }
  const { error } = await supabaseAdmin.from("app_unlocks").upsert(
    {
      user_id: userId,
      stripe_session_id: session?.id ?? null,
      paid_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) console.error("Failed to record app unlock:", error);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "transaction.completed":
    case "checkout.session.completed":
      if (event.data.object?.metadata?.kind === "soupytag_unlock") {
        await handleAppUnlock(event.data.object);
      } else {
        await handleTransactionCompleted(event.data.object);
      }
      break;
    default:
      console.log("Unhandled webhook event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook: invalid env query", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
