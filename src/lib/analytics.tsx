import { PostHogProvider, usePostHog } from "@posthog/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AnalyticsConsent = "unset" | "granted" | "denied";
export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

type AnalyticsContextValue = {
  consent: AnalyticsConsent;
  distinctId: string | null;
  setConsent: (consent: Exclude<AnalyticsConsent, "unset">) => void;
  capture: (event: string, properties?: AnalyticsProperties) => void;
  captureException: (error: unknown, properties?: AnalyticsProperties) => void;
};

const CONSENT_KEY = "soupytag:analytics:consent:v1";
const INSTALL_ID_KEY = "soupytag:analytics:install:v1";

const AnalyticsContext = createContext<AnalyticsContextValue>({
  consent: "unset",
  distinctId: null,
  setConsent: () => undefined,
  capture: () => undefined,
  captureException: () => undefined,
});

function readConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return "unset";
  const value = window.localStorage.getItem(CONSENT_KEY);
  return value === "granted" || value === "denied" ? value : "unset";
}

function getOrCreateInstallId(): string {
  const existing = window.localStorage.getItem(INSTALL_ID_KEY);
  if (existing) return existing;
  const id = globalThis.crypto?.randomUUID?.() ?? `install-${Date.now()}-${Math.random()}`;
  window.localStorage.setItem(INSTALL_ID_KEY, id);
  return id;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [consent, setConsentState] = useState<AnalyticsConsent>("unset");
  const [distinctId, setDistinctId] = useState<string | null>(null);

  useEffect(() => {
    const stored = readConsent();
    setConsentState(stored);
    if (stored === "granted") setDistinctId(getOrCreateInstallId());
  }, []);

  const setConsent = useCallback((next: Exclude<AnalyticsConsent, "unset">) => {
    window.localStorage.setItem(CONSENT_KEY, next);
    setConsentState(next);
    setDistinctId(next === "granted" ? getOrCreateInstallId() : null);
  }, []);

  const token = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN as string | undefined;
  const host =
    (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";

  if (consent === "granted" && token && distinctId) {
    return (
      <PostHogProvider
        apiKey={token}
        options={{
          api_host: host,
          defaults: "2026-01-30",
          autocapture: false,
          capture_pageview: false,
          capture_exceptions: false,
          disable_session_recording: true,
          persistence: "localStorage",
          person_profiles: "never",
        }}
      >
        <EnabledAnalytics
          consent={consent}
          distinctId={distinctId}
          setDistinctId={setDistinctId}
          setConsentState={setConsentState}
        >
          {children}
        </EnabledAnalytics>
      </PostHogProvider>
    );
  }

  return (
    <AnalyticsContext.Provider
      value={{
        consent,
        distinctId,
        setConsent,
        capture: () => undefined,
        captureException: () => undefined,
      }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
}

function EnabledAnalytics({
  children,
  consent,
  distinctId,
  setDistinctId,
  setConsentState,
}: {
  children: ReactNode;
  consent: AnalyticsConsent;
  distinctId: string;
  setDistinctId: (distinctId: string | null) => void;
  setConsentState: (consent: AnalyticsConsent) => void;
}) {
  const posthog = usePostHog();

  useEffect(() => {
    posthog.identify(distinctId);
  }, [distinctId, posthog]);

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      consent,
      distinctId,
      setConsent: (next) => {
        window.localStorage.setItem(CONSENT_KEY, next);
        if (next === "denied") {
          posthog.opt_out_capturing();
          posthog.reset();
          setDistinctId(null);
        }
        setConsentState(next);
      },
      capture: (event, properties) => posthog.capture(event, properties),
      captureException: (error, properties) => posthog.captureException(error, properties),
    }),
    [consent, distinctId, posthog, setConsentState, setDistinctId],
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics() {
  return useContext(AnalyticsContext);
}

export function hasAnalyticsConsent(): boolean {
  return readConsent() === "granted";
}
