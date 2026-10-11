import { Capacitor, registerPlugin } from "@capacitor/core";
import { PostHogProvider, usePostHog } from "@posthog/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ANALYTICS_CONSENT_KEY,
  canCaptureFirebaseEvent,
  firebaseEvent,
  getAnalyticsProvider,
  readAnalyticsConsent,
  revokeFirebaseAnalytics,
  shouldLogFirebaseAppOpen,
  type AnalyticsConsent,
  type AnalyticsProperties,
  type FirebaseRevocationResult,
} from "./analytics-policy";

export type { AnalyticsConsent, AnalyticsProperties } from "./analytics-policy";

type FirebaseAnalyticsStatus = {
  configured: boolean;
  consent: AnalyticsConsent;
  collectionEnabled: boolean;
};

type FirebaseAnalyticsConsentResult = FirebaseAnalyticsStatus & {
  collectionDisabled: boolean;
  persisted: boolean;
};

type FirebaseAnalyticsPlugin = {
  getStatus(): Promise<FirebaseAnalyticsStatus>;
  setConsent(options: {
    consent: Exclude<AnalyticsConsent, "unset">;
  }): Promise<FirebaseAnalyticsConsentResult>;
  logEvent(options: {
    name: string;
    parameters: Record<string, string | number | boolean>;
  }): Promise<void>;
};

type AnalyticsContextValue = {
  consent: AnalyticsConsent;
  consentStatus:
    | "pending"
    | "enabling"
    | "unconfirmed"
    | "session-only"
    | "grant-unconfirmed"
    | "unavailable"
    | null;
  distinctId: string | null;
  setConsent: (consent: Exclude<AnalyticsConsent, "unset">) => Promise<void>;
  capture: (event: string, properties?: AnalyticsProperties) => void;
  captureException: (error: unknown, properties?: AnalyticsProperties) => void;
};

const INSTALL_ID_KEY = "soupytag:analytics:install:v1";
const FirebaseAnalyticsBridge = registerPlugin<FirebaseAnalyticsPlugin>("FirebaseAnalyticsBridge");

const AnalyticsContext = createContext<AnalyticsContextValue>({
  consent: "unset",
  consentStatus: null,
  distinctId: null,
  setConsent: async () => undefined,
  capture: () => undefined,
  captureException: () => undefined,
});

function persistConsent(consent: AnalyticsConsent) {
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);
    return true;
  } catch {
    return false;
  }
}

function readStoredConsent(): AnalyticsConsent {
  try {
    return readAnalyticsConsent(window.localStorage);
  } catch {
    return "unset";
  }
}

function getOrCreateInstallId(): string {
  const existing = window.localStorage.getItem(INSTALL_ID_KEY);
  if (existing) return existing;
  const id = globalThis.crypto?.randomUUID?.() ?? `install-${Date.now()}-${Math.random()}`;
  window.localStorage.setItem(INSTALL_ID_KEY, id);
  return id;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const provider = getAnalyticsProvider(Capacitor.getPlatform());
  const [consent, setConsentState] = useState<AnalyticsConsent>("unset");
  const [distinctId, setDistinctId] = useState<string | null>(null);
  const [nativeConfigured, setNativeConfigured] = useState(false);
  const [nativeConsentAtStartup, setNativeConsentAtStartup] = useState(false);
  const [consentStatus, setConsentStatus] = useState<AnalyticsContextValue["consentStatus"]>(null);
  const [ready, setReady] = useState(false);
  const openedThisSession = useRef(false);
  const blockFirebaseEvents = useRef(true);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (provider === "firebase") {
        try {
          const nativeStatus = await FirebaseAnalyticsBridge.getStatus();
          let storedConsent = nativeStatus.configured ? nativeStatus.consent : "denied";
          if (storedConsent === "unset" && readStoredConsent() === "denied") {
            const deniedStatus = await FirebaseAnalyticsBridge.setConsent({ consent: "denied" });
            storedConsent = deniedStatus.consent;
          }
          if (!active) return;
          setNativeConfigured(nativeStatus.configured);
          const collectionEnabled =
            nativeStatus.configured &&
            storedConsent === "granted" &&
            nativeStatus.collectionEnabled;
          setNativeConsentAtStartup(collectionEnabled);
          blockFirebaseEvents.current = !collectionEnabled;
          setConsentState(storedConsent);
          setConsentStatus(
            storedConsent === "granted" && !collectionEnabled ? "grant-unconfirmed" : null,
          );
        } catch {
          if (!active) return;
          setNativeConfigured(false);
          blockFirebaseEvents.current = true;
          setConsentState("denied");
          setConsentStatus("unconfirmed");
        }
      } else {
        const storedConsent = readStoredConsent();
        if (!active) return;
        setConsentState(storedConsent);
        if (storedConsent === "granted" && provider === "posthog") {
          try {
            setDistinctId(getOrCreateInstallId());
          } catch {
            setConsentState("unset");
          }
        }
      }
      if (active) setReady(true);
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [provider]);

  const setConsent = useCallback(
    async (next: Exclude<AnalyticsConsent, "unset">) => {
      if (provider === "firebase") {
        if (next === "denied") {
          blockFirebaseEvents.current = true;
          setConsentStatus("pending");
          const result: FirebaseRevocationResult = await revokeFirebaseAnalytics(async () => {
            const status = await FirebaseAnalyticsBridge.setConsent({ consent: "denied" });
            return {
              configured: status.configured,
              collectionDisabled: status.collectionDisabled,
              persisted: status.persisted,
            };
          });
          setNativeConfigured(result.configured);
          if (result.collectionDisabled) {
            setConsentState("denied");
            if (result.persisted) {
              persistConsent("denied");
              setConsentStatus(null);
            } else {
              setConsentStatus("session-only");
            }
          } else {
            setConsentStatus("unconfirmed");
          }
          setDistinctId(null);
          return;
        }

        blockFirebaseEvents.current = true;
        setConsentStatus("enabling");
        try {
          const nativeStatus = await FirebaseAnalyticsBridge.setConsent({ consent: next });
          const appliedConsent =
            nativeStatus.configured &&
            nativeStatus.consent === "granted" &&
            nativeStatus.collectionEnabled &&
            nativeStatus.persisted
              ? "granted"
              : "denied";
          if (appliedConsent === "granted") {
            persistConsent("granted");
            blockFirebaseEvents.current = false;
            setConsentStatus(null);
          } else if (!nativeStatus.configured) {
            blockFirebaseEvents.current = true;
            setConsentStatus("unavailable");
          } else {
            blockFirebaseEvents.current = true;
            setConsentStatus("grant-unconfirmed");
          }
          setNativeConfigured(nativeStatus.configured);
          setConsentState(appliedConsent);
        } catch {
          blockFirebaseEvents.current = true;
          setNativeConfigured(false);
          setConsentStatus("grant-unconfirmed");
        }
        setDistinctId(null);
        return;
      }

      if (!persistConsent(next)) {
        setConsentState("unset");
        setDistinctId(null);
        return;
      }
      setConsentState(next);
      try {
        setDistinctId(next === "granted" && provider === "posthog" ? getOrCreateInstallId() : null);
      } catch {
        persistConsent("unset");
        setConsentState("unset");
        setDistinctId(null);
      }
    },
    [provider],
  );

  const captureFirebaseEvent = useCallback(
    (event: string, properties?: AnalyticsProperties) => {
      if (
        provider !== "firebase" ||
        !canCaptureFirebaseEvent(consent, nativeConfigured, blockFirebaseEvents.current)
      ) {
        return;
      }
      const allowed = firebaseEvent(event, properties);
      if (allowed) void FirebaseAnalyticsBridge.logEvent(allowed).catch(() => undefined);
    },
    [consent, nativeConfigured, provider],
  );

  useEffect(() => {
    if (
      provider === "firebase" &&
      shouldLogFirebaseAppOpen(ready, consent, nativeConsentAtStartup) &&
      !openedThisSession.current
    ) {
      openedThisSession.current = true;
      captureFirebaseEvent("app_opened");
    }
  }, [captureFirebaseEvent, consent, nativeConsentAtStartup, provider, ready]);

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      consent,
      consentStatus,
      distinctId,
      setConsent,
      capture: captureFirebaseEvent,
      captureException: () => undefined,
    }),
    [captureFirebaseEvent, consent, consentStatus, distinctId, setConsent],
  );

  const token = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN as string | undefined;
  const host =
    (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";

  if (provider === "posthog" && ready && consent === "granted" && token && distinctId) {
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
          setConsent={setConsent}
        >
          {children}
        </EnabledAnalytics>
      </PostHogProvider>
    );
  }

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

function EnabledAnalytics({
  children,
  consent,
  distinctId,
  setDistinctId,
  setConsentState,
  setConsent,
}: {
  children: ReactNode;
  consent: AnalyticsConsent;
  distinctId: string;
  setDistinctId: (distinctId: string | null) => void;
  setConsentState: (consent: AnalyticsConsent) => void;
  setConsent: (consent: Exclude<AnalyticsConsent, "unset">) => Promise<void>;
}) {
  const posthog = usePostHog();

  useEffect(() => {
    posthog.identify(distinctId);
  }, [distinctId, posthog]);

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      consent,
      consentStatus: null,
      distinctId,
      setConsent: async (next) => {
        if (next === "denied") {
          posthog.opt_out_capturing();
          posthog.reset();
          setDistinctId(null);
          persistConsent("denied");
          setConsentState("denied");
          return;
        }
        await setConsent(next);
      },
      capture: (event, properties) => posthog.capture(event, properties),
      captureException: () => undefined,
    }),
    [consent, distinctId, posthog, setConsent, setConsentState, setDistinctId],
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics() {
  return useContext(AnalyticsContext);
}

export function hasAnalyticsConsent(): boolean {
  return typeof window !== "undefined" && readStoredConsent() === "granted";
}
