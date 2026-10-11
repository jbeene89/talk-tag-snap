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
  firebaseCollectionEnabled,
  firebaseEvent,
  firebaseGrantConfirmed,
  firebaseRevocationConfirmed,
  firebaseStartupAllowed,
  getAnalyticsProvider,
  readAnalyticsConsent,
  shouldLogFirebaseAppOpen,
  type AnalyticsConsent,
  type AnalyticsProperties,
} from "./analytics-policy";

export type { AnalyticsConsent, AnalyticsProperties } from "./analytics-policy";

type FirebaseAnalyticsStatus = {
  configured: boolean;
  consent: AnalyticsConsent;
  confirmed: boolean;
  error?: string;
};

function firebaseStatusMessage(status: FirebaseAnalyticsStatus, fallback: string): string {
  if (status.error === "storage") return "Consent could not be stored; analytics remains off.";
  if (status.error === "disable")
    return "Firebase could not confirm collection is off. Retry opt-out.";
  if (status.error === "initialize")
    return "Firebase could not start with consent. Analytics remains off.";
  return fallback;
}

type FirebaseAnalyticsPlugin = {
  getStatus(): Promise<FirebaseAnalyticsStatus>;
  setConsent(options: {
    consent: Exclude<AnalyticsConsent, "unset">;
  }): Promise<FirebaseAnalyticsStatus>;
  logEvent(options: {
    name: string;
    parameters: Record<string, string | number | boolean>;
  }): Promise<void>;
};

type AnalyticsContextValue = {
  consent: AnalyticsConsent;
  consentError: string | null;
  revocationPending: boolean;
  distinctId: string | null;
  setConsent: (consent: Exclude<AnalyticsConsent, "unset">) => Promise<void>;
  retryRevocation: () => Promise<void>;
  capture: (event: string, properties?: AnalyticsProperties) => void;
  captureException: (error: unknown, properties?: AnalyticsProperties) => void;
};

const INSTALL_ID_KEY = "soupytag:analytics:install:v1";
const FirebaseAnalyticsBridge = registerPlugin<FirebaseAnalyticsPlugin>("FirebaseAnalyticsBridge");

const AnalyticsContext = createContext<AnalyticsContextValue>({
  consent: "unset",
  consentError: null,
  revocationPending: false,
  distinctId: null,
  setConsent: async () => undefined,
  retryRevocation: async () => undefined,
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
  const [consentError, setConsentError] = useState<string | null>(null);
  const [revocationPending, setRevocationPending] = useState(false);
  const [ready, setReady] = useState(false);
  const openedThisSession = useRef(false);
  const firebaseCollectionConfirmed = useRef(false);
  const nativeConsentQueue = useRef(Promise.resolve());
  const applyFirebaseConsent = useCallback((requested: Exclude<AnalyticsConsent, "unset">) => {
    const request = nativeConsentQueue.current.then(() =>
      FirebaseAnalyticsBridge.setConsent({ consent: requested }),
    );
    nativeConsentQueue.current = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (provider === "firebase") {
        try {
          const nativeStatus = await FirebaseAnalyticsBridge.getStatus();
          const validStartupGrant = firebaseStartupAllowed(
            nativeStatus.configured,
            nativeStatus.consent,
            readStoredConsent(),
            nativeStatus.confirmed,
          );
          const appliedStatus = await applyFirebaseConsent(
            validStartupGrant ? "granted" : "denied",
          );
          if (!validStartupGrant) persistConsent("denied");
          const confirmedGrant =
            validStartupGrant &&
            firebaseGrantConfirmed(
              appliedStatus.configured,
              appliedStatus.consent,
              appliedStatus.confirmed,
            );
          if (!active) return;
          firebaseCollectionConfirmed.current = confirmedGrant;
          setNativeConfigured(appliedStatus.configured && appliedStatus.confirmed);
          setNativeConsentAtStartup(confirmedGrant);
          setConsentState(confirmedGrant ? "granted" : "denied");
          setRevocationPending(!confirmedGrant && !appliedStatus.confirmed);
          setConsentError(
            validStartupGrant && !confirmedGrant
              ? firebaseStatusMessage(
                  appliedStatus,
                  "Saved analytics consent could not be revalidated. Analytics remains off.",
                )
              : appliedStatus.confirmed
                ? null
                : firebaseStatusMessage(
                    appliedStatus,
                    "Native analytics opt-out is unconfirmed. Retry to confirm it.",
                  ),
          );
        } catch {
          if (!active) return;
          persistConsent("denied");
          firebaseCollectionConfirmed.current = false;
          setNativeConsentAtStartup(false);
          setConsentState("denied");
          try {
            const status = await applyFirebaseConsent("denied");
            setNativeConfigured(status.configured && status.confirmed);
            setRevocationPending(!status.confirmed);
            setConsentError(
              status.confirmed
                ? "Saved analytics consent could not be revalidated. Analytics remains off."
                : "Native analytics opt-out is unconfirmed. Retry to confirm it.",
            );
          } catch {
            setNativeConfigured(false);
            setRevocationPending(true);
            setConsentError("Native analytics opt-out is unconfirmed. Retry to confirm it.");
          }
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
  }, [applyFirebaseConsent, provider]);

  const setConsent = useCallback(
    async (next: Exclude<AnalyticsConsent, "unset">) => {
      if (provider === "firebase") {
        if (next === "denied") {
          firebaseCollectionConfirmed.current = false;
          setConsentState("denied");
          setNativeConsentAtStartup(false);
          setDistinctId(null);
          persistConsent("denied");
          setRevocationPending(true);
          try {
            const status = await applyFirebaseConsent("denied");
            const confirmed = firebaseRevocationConfirmed(status.consent, status.confirmed);
            setNativeConfigured(status.configured && status.confirmed);
            setRevocationPending(!confirmed);
            setConsentError(
              confirmed ? null : "Native analytics opt-out is unconfirmed. Retry to confirm it.",
            );
            if (!confirmed) {
              setConsentError(
                firebaseStatusMessage(
                  status,
                  "Native analytics opt-out is unconfirmed. Retry to confirm it.",
                ),
              );
            }
          } catch {
            setNativeConfigured(false);
            setRevocationPending(true);
            setConsentError("Native analytics opt-out is unconfirmed. Retry to confirm it.");
          }
          return;
        }

        if (!persistConsent("granted")) {
          firebaseCollectionConfirmed.current = false;
          setConsentState("denied");
          setNativeConsentAtStartup(false);
          setNativeConfigured(false);
          setDistinctId(null);
          setRevocationPending(false);
          setConsentError("Analytics could not be enabled because consent storage is unavailable.");
          return;
        }

        try {
          const status = await applyFirebaseConsent("granted");
          const confirmedGrant = firebaseGrantConfirmed(
            status.configured,
            status.consent,
            status.confirmed,
          );
          if (confirmedGrant) {
            firebaseCollectionConfirmed.current = true;
            setNativeConfigured(true);
            setConsentState("granted");
            setConsentError(null);
            setRevocationPending(false);
            return;
          }

          firebaseCollectionConfirmed.current = false;
          setNativeConsentAtStartup(false);
          setConsentState("denied");
          setDistinctId(null);
          persistConsent("denied");
          setNativeConfigured(false);
          setRevocationPending(true);
          setConsentError(
            !status.configured && status.confirmed
              ? null
              : firebaseStatusMessage(
                  status,
                  "Analytics could not be enabled and remains off. Retry the choice to try again.",
                ),
          );
          try {
            const disabled = await applyFirebaseConsent("denied");
            setRevocationPending(!disabled.confirmed);
            if (disabled.confirmed)
              setConsentError("Analytics could not be enabled and remains off.");
          } catch {
            setRevocationPending(true);
          }
        } catch {
          firebaseCollectionConfirmed.current = false;
          persistConsent("denied");
          setConsentState("denied");
          setNativeConsentAtStartup(false);
          setNativeConfigured(false);
          setDistinctId(null);
          setRevocationPending(true);
          setConsentError(
            "Analytics could not be enabled and remains off. Retry the choice to try again.",
          );
          try {
            const disabled = await applyFirebaseConsent("denied");
            setRevocationPending(!disabled.confirmed);
            if (disabled.confirmed)
              setConsentError("Analytics could not be enabled and remains off.");
          } catch {
            setRevocationPending(true);
          }
        }
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
    [applyFirebaseConsent, provider],
  );

  const retryRevocation = useCallback(async () => setConsent("denied"), [setConsent]);

  const captureFirebaseEvent = useCallback(
    (event: string, properties?: AnalyticsProperties) => {
      if (
        provider !== "firebase" ||
        !firebaseCollectionConfirmed.current ||
        !firebaseCollectionEnabled(consent, nativeConfigured)
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
      consentError,
      revocationPending,
      distinctId,
      setConsent,
      retryRevocation,
      capture: captureFirebaseEvent,
      captureException: () => undefined,
    }),
    [
      captureFirebaseEvent,
      consent,
      consentError,
      distinctId,
      revocationPending,
      retryRevocation,
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
      consentError: null,
      revocationPending: false,
      distinctId,
      retryRevocation: async () => undefined,
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
