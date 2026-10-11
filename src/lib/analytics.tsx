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
  firebaseEvent,
  getAnalyticsProvider,
  readAnalyticsConsent,
  shouldLogFirebaseAppOpen,
  type AnalyticsConsent,
  type AnalyticsProperties,
} from "./analytics-policy";
import {
  resolveFirebaseConsent,
  shouldCaptureFirebaseEvent,
  updateFirebaseConsent,
  type FirebaseConsentUpdateStatus,
  type FirebaseNativeConsentStatus,
} from "./firebase-consent";

export type { AnalyticsConsent, AnalyticsProperties } from "./analytics-policy";

type FirebaseAnalyticsPlugin = {
  getStatus(): Promise<FirebaseNativeConsentStatus>;
  setConsent(options: {
    consent: Exclude<AnalyticsConsent, "unset">;
  }): Promise<FirebaseNativeConsentStatus>;
  logEvent(options: {
    name: string;
    parameters: Record<string, string | number | boolean>;
  }): Promise<void>;
};

type AnalyticsContextValue = {
  consent: AnalyticsConsent;
  consentUpdateStatus: FirebaseConsentUpdateStatus;
  nativeCollectionConfirmed: boolean;
  nativeConsentPersisted: boolean;
  distinctId: string | null;
  setConsent: (consent: Exclude<AnalyticsConsent, "unset">) => Promise<void>;
  retryConsent: () => Promise<void>;
  capture: (event: string, properties?: AnalyticsProperties) => void;
  captureException: (error: unknown, properties?: AnalyticsProperties) => void;
};

const INSTALL_ID_KEY = "soupytag:analytics:install:v1";
const FirebaseAnalyticsBridge = registerPlugin<FirebaseAnalyticsPlugin>("FirebaseAnalyticsBridge");

const AnalyticsContext = createContext<AnalyticsContextValue>({
  consent: "unset",
  consentUpdateStatus: "idle",
  nativeCollectionConfirmed: false,
  nativeConsentPersisted: false,
  distinctId: null,
  setConsent: async () => undefined,
  retryConsent: async () => undefined,
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
  const [consentUpdateStatus, setConsentUpdateStatus] =
    useState<FirebaseConsentUpdateStatus>("idle");
  const [nativeCollectionConfirmed, setNativeCollectionConfirmed] = useState(false);
  const [nativeConsentPersisted, setNativeConsentPersisted] = useState(false);
  const [ready, setReady] = useState(false);
  const firebaseCollectionBlocked = useRef(true);
  const openedThisSession = useRef(false);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (provider === "firebase") {
        setConsentUpdateStatus("pending");
        const result = await resolveFirebaseConsent(
          readStoredConsent(),
          FirebaseAnalyticsBridge,
          persistConsent,
        );
        if (!active) return;
        const enabled = result.confirmed && result.configured && result.collectionEnabled;
        firebaseCollectionBlocked.current = !enabled;
        setNativeConfigured(enabled);
        setNativeConsentAtStartup(enabled && result.consent === "granted");
        setNativeCollectionConfirmed(result.collectionConfirmed);
        setNativeConsentPersisted(result.consentPersisted);
        setConsentState(result.consent);
        setConsentUpdateStatus(result.confirmed ? "idle" : "unconfirmed");
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
        firebaseCollectionBlocked.current = true;
        setNativeConfigured(false);
        setNativeConsentAtStartup(false);
        setConsentState(next === "denied" ? "denied" : "unset");
        setConsentUpdateStatus("pending");
        const result = await updateFirebaseConsent(next, FirebaseAnalyticsBridge, persistConsent);
        const enabled = result.confirmed && result.configured && result.collectionEnabled;
        firebaseCollectionBlocked.current = !enabled;
        setNativeConfigured(enabled);
        setNativeCollectionConfirmed(result.collectionConfirmed);
        setNativeConsentPersisted(result.consentPersisted);
        setConsentState(result.consent);
        setConsentUpdateStatus(result.confirmed ? "idle" : "unconfirmed");
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

  const retryConsent = useCallback(async () => setConsent("denied"), [setConsent]);

  const captureFirebaseEvent = useCallback(
    (event: string, properties?: AnalyticsProperties) => {
      if (
        provider !== "firebase" ||
        !shouldCaptureFirebaseEvent(consent, nativeConfigured, firebaseCollectionBlocked.current)
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
      consentUpdateStatus,
      nativeCollectionConfirmed,
      nativeConsentPersisted,
      distinctId,
      setConsent,
      retryConsent,
      capture: captureFirebaseEvent,
      captureException: () => undefined,
    }),
    [
      captureFirebaseEvent,
      consent,
      consentUpdateStatus,
      nativeCollectionConfirmed,
      nativeConsentPersisted,
      distinctId,
      retryConsent,
      setConsent,
    ],
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
          consentUpdateStatus={consentUpdateStatus}
          nativeCollectionConfirmed={nativeCollectionConfirmed}
          nativeConsentPersisted={nativeConsentPersisted}
          retryConsent={retryConsent}
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
  consentUpdateStatus,
  nativeCollectionConfirmed,
  nativeConsentPersisted,
  retryConsent,
}: {
  children: ReactNode;
  consent: AnalyticsConsent;
  distinctId: string;
  setDistinctId: (distinctId: string | null) => void;
  setConsentState: (consent: AnalyticsConsent) => void;
  setConsent: (consent: Exclude<AnalyticsConsent, "unset">) => Promise<void>;
  consentUpdateStatus: FirebaseConsentUpdateStatus;
  nativeCollectionConfirmed: boolean;
  nativeConsentPersisted: boolean;
  retryConsent: () => Promise<void>;
}) {
  const posthog = usePostHog();

  useEffect(() => {
    posthog.identify(distinctId);
  }, [distinctId, posthog]);

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      consent,
      consentUpdateStatus,
      nativeCollectionConfirmed,
      nativeConsentPersisted,
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
      retryConsent,
      capture: (event, properties) => posthog.capture(event, properties),
      captureException: () => undefined,
    }),
    [
      consent,
      consentUpdateStatus,
      nativeCollectionConfirmed,
      nativeConsentPersisted,
      distinctId,
      posthog,
      retryConsent,
      setConsent,
      setConsentState,
      setDistinctId,
    ],
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics() {
  return useContext(AnalyticsContext);
}

export function hasAnalyticsConsent(): boolean {
  return typeof window !== "undefined" && readStoredConsent() === "granted";
}
