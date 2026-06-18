import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useCallback, useMemo, useState } from "react";

import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { supabase } from "@/integrations/supabase/client";
import { createOrderCheckout } from "@/lib/orders.functions";
import { getStripe, getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";

export const Route = createFileRoute("/wrapkit")({
  component: WrapkitPage,
  head: () => ({
    meta: [
      { title: "WrapKit Cloud — Turn your website into an Android app for $99" },
      {
        name: "description",
        content:
          "We wrap your website into a signed Android app (.aab) ready to upload to the Google Play Store. Flat $99. Delivered within 48 hours.",
      },
      { property: "og:title", content: "WrapKit Cloud" },
      {
        property: "og:description",
        content: "Your website, as an Android app. $99 flat. Delivered in 48 hours.",
      },
    ],
  }),
});

const PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

function WrapkitPage() {
  const [siteUrl, setSiteUrl] = useState("");
  const [appName, setAppName] = useState("");
  const [packageName, setPackageName] = useState("");
  const [email, setEmail] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const createCheckout = useServerFn(createOrderCheckout);

  const validate = useCallback((): string | null => {
    try {
      new URL(siteUrl);
    } catch {
      return "Please enter a valid website URL (including https://).";
    }
    if (appName.trim().length < 2) return "App name is too short.";
    if (!PACKAGE_RE.test(packageName))
      return "Package name must look like com.yourcompany.yourapp (lowercase, dots between words).";
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Please enter a valid email.";
    if (!iconFile) return "Please upload an app icon (square PNG, 512×512 recommended).";
    if (iconFile.size > 2 * 1024 * 1024) return "Icon must be under 2 MB.";
    if (!isPaymentsConfigured()) return "Payments are not configured yet. Try again shortly.";
    return null;
  }, [appName, email, iconFile, packageName, siteUrl]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const v = validate();
      if (v) {
        setError(v);
        return;
      }
      setError(null);
      setSubmitting(true);
      try {
        // 1. Upload icon to the public bucket (anon insert is allowed).
        const ext = iconFile!.name.split(".").pop()?.toLowerCase() || "png";
        const iconPath = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("order-icons")
          .upload(iconPath, iconFile!, { contentType: iconFile!.type });
        if (uploadError) throw new Error(uploadError.message);

        // 2. Create the order row.
        const { data: order, error: insertError } = await supabase
          .from("orders")
          .insert({
            customer_email: email.trim(),
            site_url: siteUrl.trim(),
            app_name: appName.trim(),
            package_name: packageName.trim(),
            icon_storage_path: iconPath,
            status: "pending_payment",
          })
          .select("id")
          .single();
        if (insertError) throw new Error(insertError.message);

        // 3. Open Stripe Embedded Checkout.
        const result = await createCheckout({
          data: {
            orderId: order.id as string,
            returnUrl: `${window.location.origin}/order/success?order_id=${order.id}`,
            environment: getStripeEnvironment(),
          },
        });
        if ("error" in result) throw new Error(result.error);
        if (!result.clientSecret) throw new Error("Could not start checkout.");
        setClientSecret(result.clientSecret);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setSubmitting(false);
      }
    },
    [appName, createCheckout, email, iconFile, packageName, siteUrl, validate]
  );

  const checkoutOptions = useMemo(
    () => (clientSecret ? { fetchClientSecret: async () => clientSecret } : null),
    [clientSecret]
  );

  if (clientSecret && checkoutOptions) {
    return (
      <div className="min-h-screen bg-background">
        <PaymentTestModeBanner />
        <div className="mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-2xl font-semibold mb-4">Finish your order</h1>
          <EmbeddedCheckoutProvider stripe={getStripe()} options={checkoutOptions}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PaymentTestModeBanner />

      {/* HERO */}
      <section className="mx-auto max-w-4xl px-4 pt-16 pb-10 text-center">
        <p className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          WrapKit Cloud
        </p>
        <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight">
          Your website. As an Android app. <span className="text-primary">$99.</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          We wrap your site into a signed Android app file (.aab) — ready for you
          to upload to the Google Play Store. Delivered within 48 hours.
        </p>
        <a
          href="#order"
          className="mt-8 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Order now — $99
        </a>
        <p className="mt-3 text-xs text-muted-foreground">
          Flat one-time fee. No subscriptions. Tax handled automatically.
        </p>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-4xl px-4 py-10">
        <h2 className="text-2xl font-semibold text-center">How it works</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            ["1. Submit", "Drop in your website URL, app name, package name, and icon."],
            ["2. Pay $99", "Secure checkout. You get an email receipt."],
            ["3. Get your .aab", "We email you a signed Android app file within 48 hours."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ORDER FORM */}
      <section id="order" className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">Place your order</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We need a few details to build your app. Everything is delivered to the email below.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label="Website URL" hint="The full https:// link to your site">
              <input
                type="url"
                required
                placeholder="https://example.com"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="App name" hint="Shown on the user's Android home screen">
              <input
                type="text"
                required
                maxLength={50}
                placeholder="My Cool App"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field
              label="Package name"
              hint="A unique ID for Play Store. Format: com.yourcompany.yourapp (lowercase)"
            >
              <input
                type="text"
                required
                placeholder="com.yourcompany.yourapp"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value.toLowerCase())}
                className={inputClass}
              />
            </Field>

            <Field label="Your email" hint="Where we send the receipt and the .aab file">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="App icon" hint="Square PNG, 512×512 recommended, under 2 MB">
              <input
                type="file"
                accept="image/png,image/jpeg"
                required
                onChange={(e) => setIconFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
              />
            </Field>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary px-4 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Preparing checkout…" : "Continue to payment — $99"}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              By placing your order you agree to a 48-hour delivery window.
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}

const inputClass =
  "block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
