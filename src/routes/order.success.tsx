import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/order/success")({
  validateSearch: (search: Record<string, unknown>) => ({
    order_id: typeof search.order_id === "string" ? search.order_id : undefined,
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Order Confirmed — WrapKit Cloud by SoupyTag" },
      {
        name: "description",
        content:
          "Your WrapKit Cloud order is confirmed. We'll email your signed Android app (.aab) within 48 hours.",
      },
      { property: "og:title", content: "Order Confirmed — WrapKit Cloud" },
      {
        property: "og:description",
        content: "Your WrapKit Cloud order is confirmed. Android app delivery within 48 hours.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrderSuccess,
});

function OrderSuccess() {
  const { order_id } = Route.useSearch();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <span className="text-2xl">✓</span>
        </div>
        <h1 className="text-2xl font-semibold">Payment received</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Thank you! We're building your Android app now. You'll get an email with
          your .aab file within 48 hours.
        </p>
        {order_id && (
          <p className="mt-4 text-xs text-muted-foreground">
            Order reference: <span className="font-mono">{order_id.slice(0, 8)}</span>
          </p>
        )}
        <Link
          to="/wrapkit"
          className="mt-6 inline-block rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Back to WrapKit
        </Link>
      </div>
    </div>
  );
}
