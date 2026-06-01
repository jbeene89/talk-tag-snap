import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — SoupyTag" },
      { name: "description", content: "Review the SoupyTag Privacy Policy to understand how we protect your photos, voice annotations, and AI tagging data." },
      { property: "og:title", content: "Privacy Policy — SoupyTag" },
      { property: "og:description", content: "How SoupyTag handles your photos, voice notes, and AI tagging data — what stays on your device and what doesn't." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-foreground">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        ← Back to app
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: June 1, 2026
      </p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed">
        <p>
          SoupyTag ("the app") is designed to respect your privacy. This page
          explains what the app does and does not collect.
        </p>

        <h2 className="mt-6 text-lg font-semibold">What we collect</h2>
        <p>
          <strong>Nothing personal.</strong> SoupyTag does not require an
          account and does not collect names, emails, contacts, or location.
        </p>

        <h2 className="mt-6 text-lg font-semibold">Photos and tags</h2>
        <p>
          Photos you capture or upload, and the tags you add to them, are
          stored <strong>locally on your device</strong>. They are not
          uploaded to our servers and are not shared with third parties.
        </p>

        <h2 className="mt-6 text-lg font-semibold">Camera and microphone</h2>
        <p>
          The app may request access to your camera (to take photos) and
          microphone (to record voice tags). These are only used when you
          actively choose to use those features. Recordings stay on your
          device.
        </p>

        <h2 className="mt-6 text-lg font-semibold">AI tagging</h2>
        <p>
          When you use the AI tagging feature, the image and your prompt are
          sent to our AI provider solely to generate the tag and are not
          stored by us beyond what's needed to return a result.
        </p>

        <h2 className="mt-6 text-lg font-semibold">Children</h2>
        <p>
          The app is not directed at children under 13 and does not knowingly
          collect data from them.
        </p>

        <h2 className="mt-6 text-lg font-semibold">Changes</h2>
        <p>
          If this policy changes, we'll update the date at the top of this
          page.
        </p>

        <h2 className="mt-6 text-lg font-semibold">Contact</h2>
        <p>
          Questions? Reach out at{" "}
          <a href="mailto:hello@soupytag.company" className="underline">
            hello@soupytag.company
          </a>
          .
        </p>
      </section>
    </main>
  );
}
