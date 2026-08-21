import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listOrdersTool from "./tools/list-orders";
import getOrderTool from "./tools/get-order";
import updateOrderTool from "./tools/update-order";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "talk-tag",
  title: "Talk & Tag",
  version: "0.1.0",
  instructions:
    "Tools for the SoupyTag / WrapKit Cloud app-build service. Use `list_orders` to review incoming orders, `get_order` for full details of one order, and `update_order` to set status, notes, or the finished bundle download link. All tools act as the signed-in admin.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listOrdersTool, getOrderTool, updateOrderTool],
});
