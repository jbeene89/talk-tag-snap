import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const STATUSES = [
  "pending_payment",
  "paid",
  "in_progress",
  "delivered",
  "cancelled",
] as const;

export default defineTool({
  name: "update_order",
  title: "Update an order",
  description:
    "Update a WrapKit Cloud order: set its status, admin notes, and/or the download link for the finished app bundle. Requires an admin account.",
  inputSchema: {
    id: z.string().uuid().describe("The order id."),
    status: z.enum(STATUSES).optional().describe("New status for the order."),
    admin_notes: z.string().max(2000).optional().describe("Internal notes about this order."),
    aab_download_url: z.string().url().optional().describe("Download link for the finished app bundle."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, status, admin_notes, aab_download_url }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const patch: Record<string, unknown> = {};
    if (status) patch.status = status;
    if (admin_notes !== undefined) patch.admin_notes = admin_notes;
    if (aab_download_url !== undefined) patch.aab_download_url = aab_download_url;
    if (status === "delivered") patch.delivered_at = new Date().toISOString();
    if (Object.keys(patch).length === 0) {
      return { content: [{ type: "text", text: "Nothing to update." }], isError: true };
    }

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.from("orders").update(patch).eq("id", id).select().maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return {
        content: [{ type: "text", text: "No order updated — check the id and that you have admin access." }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { order: data },
    };
  },
});
