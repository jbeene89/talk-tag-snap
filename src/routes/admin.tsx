import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { checkIsAdmin, listOrders, updateOrder } from "@/lib/orders.functions";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin — WrapKit Cloud" }] }),
});

const STATUS_OPTIONS = [
  "pending_payment",
  "paid",
  "in_progress",
  "delivered",
  "cancelled",
] as const;

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid — ready to build",
  in_progress: "Building",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  pending_payment: "bg-muted text-muted-foreground",
  paid: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

function AdminPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  const checkAdmin = useServerFn(checkIsAdmin);
  const fetchOrders = useServerFn(listOrders);
  const saveOrder = useServerFn(updateOrder);

  // Hydrate auth, gate admin, then mark ready.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        navigate({ to: "/login" });
        return;
      }
      const res = await checkAdmin();
      if (!mounted) return;
      if (!res.isAdmin) {
        navigate({ to: "/login" });
        return;
      }
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, [checkAdmin, navigate]);

  const ordersQuery = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => fetchOrders(),
    enabled: ready,
    refetchInterval: 15000,
  });

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  const orders = ordersQuery.data?.orders ?? [];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const handlePatch = async (
    orderId: string,
    patch: { status?: any; aab_download_url?: string | null; admin_notes?: string | null }
  ) => {
    await saveOrder({ data: { orderId, ...patch } });
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">WrapKit — Orders</h1>
            <p className="text-xs text-muted-foreground">
              {orders.length} order{orders.length === 1 ? "" : "s"} total
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {ordersQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {ordersQuery.error && (
          <p className="text-sm text-destructive">
            Failed to load: {(ordersQuery.error as Error).message}
          </p>
        )}
        {orders.length === 0 && !ordersQuery.isLoading && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          </div>
        )}

        <div className="space-y-4">
          {orders.map((o: any) => (
            <OrderCard key={o.id} order={o} onPatch={handlePatch} />
          ))}
        </div>
      </main>
    </div>
  );
}

function OrderCard({
  order,
  onPatch,
}: {
  order: any;
  onPatch: (
    id: string,
    patch: { status?: any; aab_download_url?: string | null; admin_notes?: string | null }
  ) => Promise<void>;
}) {
  const [downloadUrl, setDownloadUrl] = useState<string>(order.aab_download_url ?? "");
  const [notes, setNotes] = useState<string>(order.admin_notes ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          {order.icon_signed_url ? (
            <img
              src={order.icon_signed_url}
              alt={`${order.app_name} icon`}
              className="h-16 w-16 rounded-lg border border-border object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-16 w-16 rounded-lg border border-dashed border-border bg-muted flex-shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold truncate">{order.app_name}</h3>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  STATUS_COLOR[order.status] ?? ""
                }`}
              >
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
            </div>
            <p className="mt-1 text-xs font-mono text-muted-foreground truncate">
              {order.package_name}
            </p>
            <a
              href={order.site_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 block text-sm text-primary hover:underline truncate"
            >
              {order.site_url}
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              {order.customer_email} · ${(order.amount_cents / 100).toFixed(2)}
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground flex-shrink-0">
          <div>Placed: {new Date(order.created_at).toLocaleString()}</div>
          {order.paid_at && <div>Paid: {new Date(order.paid_at).toLocaleString()}</div>}
          {order.delivered_at && (
            <div>Delivered: {new Date(order.delivered_at).toLocaleString()}</div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Status</span>
          <select
            value={order.status}
            onChange={async (e) => {
              setSaving(true);
              await onPatch(order.id, { status: e.target.value });
              setSaving(false);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium">.aab download link</span>
          <div className="mt-1 flex gap-2">
            <input
              type="url"
              placeholder="https://…"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <button
              onClick={async () => {
                setSaving(true);
                await onPatch(order.id, {
                  aab_download_url: downloadUrl.trim() ? downloadUrl.trim() : null,
                });
                setSaving(false);
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
          </div>
        </label>
      </div>

      <label className="mt-3 block text-sm">
        <span className="font-medium">Internal notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={async () => {
            if ((notes ?? "") === (order.admin_notes ?? "")) return;
            setSaving(true);
            await onPatch(order.id, { admin_notes: notes || null });
            setSaving(false);
          }}
          rows={2}
          placeholder="Anything you want to remember about this order…"
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
      </label>

      {saving && (
        <p className="mt-2 text-xs text-muted-foreground">Saving…</p>
      )}
    </div>
  );
}
