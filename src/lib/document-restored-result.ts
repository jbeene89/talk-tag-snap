import {
  MAX_TRAIL_FILE_BYTES,
  parseTrail,
  validateTrail,
} from "./context-trail.ts";

export type DocumentOperation = "saveDocument" | "openDocument";
export type RestoreNoticeOperation = DocumentOperation | "listener";
export type RestoredResultEvent = {
  pluginId?: unknown;
  methodName?: unknown;
  success?: unknown;
  data?: unknown;
  error?: unknown;
};
export type RecoveredTrailImport = {
  requestId: string;
  fileName: string;
  file: File;
};
export type DocumentRestoreNotice = {
  operation: RestoreNoticeOperation;
  status: "saved" | "cancelled" | "declined" | "failed" | "pending";
  fileName?: string;
};
export type DocumentRestoreSnapshot = {
  pendingImport: RecoveredTrailImport | null;
  notice: DocumentRestoreNotice | null;
};
export type DocumentRequestResult =
  | {
      operation: "saveDocument";
      success: boolean;
      cancelled: boolean;
      fileName: string;
      location?: string;
    }
  | { operation: "openDocument"; cancelled: boolean; file?: File };

type Listener = (snapshot: DocumentRestoreSnapshot) => void;
type WaitingRequest = {
  operation: DocumentOperation;
  resolve: (result: DocumentRequestResult) => void;
  reject: (error: Error) => void;
};

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RECENT_REQUESTS = 128;

function isValidBase64(value: string, maxDecodedBytes: number): boolean {
  if (value.length === 0 || value.length % 4 !== 0) return false;
  const maxEncodedBytes = Math.ceil(maxDecodedBytes / 3) * 4;
  if (value.length > maxEncodedBytes) return false;

  let padding = 0;
  if (value.endsWith("=")) {
    padding = value.endsWith("==") ? 2 : 1;
  }
  const contentEnd = value.length - padding;
  if (
    (padding === 1 && contentEnd % 4 !== 3) ||
    (padding === 2 && contentEnd % 4 !== 2) ||
    value.length / 4 * 3 - padding > maxDecodedBytes
  )
    return false;

  for (let index = 0; index < contentEnd; index += 1) {
    const code = value.charCodeAt(index);
    const valid =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 47;
    if (!valid) return false;
  }
  for (let index = contentEnd; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 61) return false;
  }
  return true;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function safeFileName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 240 ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    return "context-trail.json";
  return value;
}

function requestIdFrom(event: RestoredResultEvent): string | null {
  const data = object(event.data);
  const error = object(event.error);
  const errorData = object(error?.data);
  const nestedErrorData = object(errorData?.data);
  const requestId =
    data?.requestId ?? errorData?.requestId ?? nestedErrorData?.requestId;
  return typeof requestId === "string" && REQUEST_ID.test(requestId) ? requestId : null;
}

async function trailFileFrom(value: unknown): Promise<{ file: File; fileName: string }> {
  const data = object(value);
  if (!data || data.ok !== true || typeof data.base64 !== "string")
    throw new Error("The recovered trail could not be opened.");

  const fileName = safeFileName(data.fileName);
  const base64 = data.base64;
  if (!isValidBase64(base64, MAX_TRAIL_FILE_BYTES))
    throw new Error("The recovered trail is malformed or too large.");

  const binary = atob(base64);
  if (binary.length > MAX_TRAIL_FILE_BYTES)
    throw new Error("The recovered trail is malformed or too large.");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const trail = validateTrail(parseTrail(text));
  const file = new File([JSON.stringify(trail)], fileName, { type: "application/json" });
  return { file, fileName };
}

export class DocumentRestoredResultCoordinator {
  private waiting = new Map<string, WaitingRequest>();
  private processing = new Set<string>();
  private handled = new Set<string>();
  private listeners = new Set<Listener>();
  private snapshot: DocumentRestoreSnapshot = { pendingImport: null, notice: null };

  getSnapshot = (): DocumentRestoreSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  };

  waitFor(operation: DocumentOperation, requestId: string): Promise<DocumentRequestResult> {
    if (!REQUEST_ID.test(requestId) || this.waiting.has(requestId))
      return Promise.reject(new Error("This document request is invalid."));
    return new Promise((resolve, reject) => {
      this.waiting.set(requestId, { operation, resolve, reject });
    });
  }

  failRequest(operation: DocumentOperation, requestId: string, reason: unknown): void {
    const waiting = this.waiting.get(requestId);
    if (!waiting || waiting.operation !== operation) return;
    this.waiting.delete(requestId);
    waiting.reject(reason instanceof Error ? reason : new Error("The document request failed."));
  }

  async acceptPromiseResult(
    operation: DocumentOperation,
    requestId: string,
    value: unknown,
  ): Promise<void> {
    const data = object(value);
    if (data?.requestId !== requestId)
      throw new Error("The document result did not match the active request.");
    await this.accept(operation, requestId, true, data);
  }

  async acceptRestoredResult(event: RestoredResultEvent): Promise<boolean> {
    if (
      event.pluginId !== "SoupyDocument" ||
      (event.methodName !== "saveDocument" && event.methodName !== "openDocument")
    )
      return false;
    const operation = event.methodName;
    const requestId = requestIdFrom(event);
    if (!requestId) {
      this.publish({
        pendingImport: this.snapshot.pendingImport,
        notice: { operation, status: "failed" },
      });
      return false;
    }
    const waiting = this.waiting.get(requestId);
    if (waiting && waiting.operation !== operation) return false;
    try {
      await this.accept(operation, requestId, event.success === true, event.data);
    } catch {
      if (!waiting) {
        this.publish({
          pendingImport: this.snapshot.pendingImport,
          notice: { operation, status: "failed" },
        });
      }
    }
    return true;
  }

  dismissPendingImport(requestId: string): void {
    if (this.snapshot.pendingImport?.requestId !== requestId) return;
    this.publish({
      pendingImport: null,
      notice: { operation: "openDocument", status: "declined" },
    });
  }

  completePendingImport(requestId: string): void {
    if (this.snapshot.pendingImport?.requestId !== requestId) return;
    this.publish({ pendingImport: null, notice: null });
  }

  clearNotice(): void {
    this.publish({ ...this.snapshot, notice: null });
  }

  reportListenerFailure(): void {
    this.publish({
      pendingImport: this.snapshot.pendingImport,
      notice: { operation: "listener", status: "failed" },
    });
  }

  private async accept(
    operation: DocumentOperation,
    requestId: string,
    succeeded: boolean,
    rawValue: unknown,
  ): Promise<void> {
    if (this.handled.has(requestId) || this.processing.has(requestId)) return;
    this.processing.add(requestId);
    const waiting = this.waiting.get(requestId);
    if (waiting && waiting.operation !== operation) {
      this.processing.delete(requestId);
      throw new Error("The document result did not match the active request.");
    }
    try {
      const data = object(rawValue);
      if (operation === "saveDocument") {
        const cancelled = succeeded && data?.cancelled === true;
        const status =
          cancelled
            ? "cancelled"
            : succeeded && data?.ok === true
              ? "saved"
              : "failed";
        const fileName = safeFileName(data?.fileName);
        if (waiting) {
          if (status === "failed") throw new Error("The document save was not verified.");
          this.waiting.delete(requestId);
          waiting.resolve({
            operation,
            success: true,
            cancelled,
            fileName,
            ...(typeof data?.uri === "string" ? { location: data.uri } : {}),
          });
        } else {
          this.publish({
            pendingImport: this.snapshot.pendingImport,
            notice: { operation, status, ...(status === "saved" ? { fileName } : {}) },
          });
        }
      } else {
        if (succeeded && data?.cancelled === true) {
          if (waiting) {
            this.waiting.delete(requestId);
            waiting.resolve({ operation, cancelled: true });
          } else {
            this.publish({
              pendingImport: this.snapshot.pendingImport,
              notice: { operation, status: "cancelled" },
            });
          }
        } else {
          if (!succeeded) throw new Error("The recovered trail could not be opened.");
          const { file, fileName } = await trailFileFrom(rawValue);
          if (this.snapshot.pendingImport && this.snapshot.pendingImport.requestId !== requestId)
            throw new Error("Another recovered trail is already waiting for review.");
          this.publish({
            pendingImport: { requestId, fileName, file },
            notice: { operation, status: "pending", fileName },
          });
          if (waiting) {
            this.waiting.delete(requestId);
            waiting.resolve({ operation, cancelled: false, file });
          }
        }
      }
      this.remember(requestId);
    } catch (error) {
      if (waiting) {
        this.waiting.delete(requestId);
        waiting.reject(error instanceof Error ? error : new Error("The document request failed."));
      }
      this.remember(requestId);
      throw error;
    } finally {
      this.processing.delete(requestId);
    }
  }

  private remember(requestId: string): void {
    this.handled.add(requestId);
    if (this.handled.size > MAX_RECENT_REQUESTS)
      this.handled.delete(this.handled.values().next().value as string);
  }

  private publish(snapshot: DocumentRestoreSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

export function createRestoredResultListenerInstaller() {
  let installation: Promise<unknown> | null = null;
  return (
    addListener: (listener: (event: RestoredResultEvent) => void) => Promise<unknown>,
    receive: (event: RestoredResultEvent) => void,
  ): Promise<unknown> => {
    if (!installation) installation = addListener(receive);
    return installation;
  };
}
