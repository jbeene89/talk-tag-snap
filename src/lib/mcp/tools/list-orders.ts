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
  name: "list_orders",
  title: "List WrapKit orders",
  description:
    "List WrapKit Cloud app-build orders, newest first. Optionally filter by status. Requires an admin account.",
  inputSchema: {
    status: z.enum(STATUSES).optional().describe("Only return orders with this status."),
    limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of orders to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("orders")
      .select(
        "id, app_name, package_name, site_url, customer_email, status, amount_cents, created_at, paid_at, delivered_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { orders: data ?? [] },
    };
  },
});
