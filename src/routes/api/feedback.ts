import { createFileRoute } from "@tanstack/react-router";

import { feedbackSchema, handleFeedback } from "@/lib/feedback.server";

// CORS is open on purpose: the bundled Android app posts feedback from its
// local WebView origin (https://localhost). The endpoint is spam-guarded by
// the `website` honeypot field and strict zod validation.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/feedback")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = feedbackSchema.parse(await request.json());
        } catch {
          return Response.json(
            { ok: false, error: "Invalid feedback payload." },
            { status: 400, headers: CORS_HEADERS },
          );
        }
        try {
          const result = await handleFeedback(parsed);
          return Response.json(result, { headers: CORS_HEADERS });
        } catch {
          return Response.json(
            { ok: false, error: "Feedback could not be saved. Please try again." },
            { status: 500, headers: CORS_HEADERS },
          );
        }
      },
    },
  },
});
