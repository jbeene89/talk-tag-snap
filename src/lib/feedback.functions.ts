import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureServerEvent } from "@/lib/analytics.server";

const feedbackSchema = z.object({
  category: z.enum(["bug", "idea", "other"]),
  message: z.string().trim().min(10).max(2000),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  diagnostics: z
    .object({
      appVersion: z.string().max(32),
      platform: z.string().max(120),
      userAgent: z.string().max(500),
    })
    .optional(),
  analyticsDistinctId: z.string().max(100).optional(),
  website: z.string().max(0).optional(),
});

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export const submitFeedback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => feedbackSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.website) return { ok: true };

    const { data: inserted, error } = await supabaseAdmin
      .from("app_feedback")
      .insert({
        category: data.category,
        message: data.message,
        email: data.email || null,
        diagnostics: data.diagnostics ?? null,
      })
      .select("id")
      .single();

    if (error) throw new Error("Feedback could not be saved. Please try again.");

    captureServerEvent(data.analyticsDistinctId, "feedback_submitted", {
      category: data.category,
      has_email: Boolean(data.email),
      has_diagnostics: Boolean(data.diagnostics),
    });

    const safeMessage = escapeHtml(data.message).replaceAll("\n", "<br />");
    const emailPayload = {
      to: "hello@soupytag.company",
      from: "SoupyTag <hello@soupytag.company>",
      sender_domain: "soupytag.company",
      subject: `SoupyTag feedback: ${data.category}`,
      html: `<h2>New SoupyTag feedback</h2><p><strong>Category:</strong> ${data.category}</p><p>${safeMessage}</p><p><strong>Reply email:</strong> ${escapeHtml(data.email || "Not provided")}</p>`,
      text: `Category: ${data.category}\n\n${data.message}\n\nReply email: ${data.email || "Not provided"}`,
      purpose: "transactional",
      label: "app_feedback",
      idempotency_key: `app-feedback-${inserted.id}`,
      message_id: `app-feedback-${inserted.id}`,
      queued_at: new Date().toISOString(),
    };

    const { error: queueError } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: emailPayload,
    });
    if (queueError) console.error("Feedback notification could not be queued", queueError);

    return { ok: true };
  });
