import { PostHog } from "posthog-node";

type ServerProperties = Record<string, string | number | boolean | null | undefined>;

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client !== undefined) return client;
  const token = process.env.POSTHOG_PROJECT_TOKEN;
  if (!token) {
    client = null;
    return client;
  }
  client = new PostHog(token, {
    host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export function captureServerEvent(
  distinctId: string | undefined,
  event: string,
  properties?: ServerProperties,
) {
  if (!distinctId) return;
  getClient()?.capture({ distinctId, event, properties });
}
