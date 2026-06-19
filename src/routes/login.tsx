import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { claimAdminIfFirstUser } from "@/lib/orders.functions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Admin sign in" }] }),
});

function LoginPage() {
  const navigate = useNavigate();
  const claim = useServerFn(claimAdminIfFirstUser);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: e1 } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (e1) throw e1;
        // Try to sign in immediately (if email confirmation is off it just works).
        const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
        if (e2) {
          setInfo("Account created. Check your email to confirm, then sign in.");
          return;
        }
        await claim();
        navigate({ to: "/admin" });
      } else {
        const { error: e1 } = await supabase.auth.signInWithPassword({ email, password });
        if (e1) throw e1;
        await claim();
        navigate({ to: "/admin" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">
          {mode === "signin" ? "Admin sign in" : "Create admin account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Sign in to view incoming orders."
            : "The first account created automatically becomes the admin."}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="email"
            required
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Password (8+ chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          {info && (
            <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">{info}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin"
            ? "First time? Create the admin account →"
            : "Already have an account? Sign in →"}
        </button>
      </div>
    </div>
  );
}
