import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy - SoupyTag" },
      {
        name: "description",
        content:
          "How SoupyTag handles photos, voice input, purchases, feedback, and optional analytics.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Link to="/" className="text-sm font-bold text-yellow-400 hover:underline">
          Back to SoupyTag
        </Link>
        <p className="mt-8 font-mono text-[10px] font-black tracking-[0.22em] text-yellow-400">
          PRIVACY / PLAIN LANGUAGE
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.04em]">Privacy Policy</h1>
        <p className="mt-2 text-sm text-neutral-500">Last updated: June 18, 2026</p>

        <section className="mt-10 space-y-7 text-sm leading-7 text-neutral-300">
          <PolicySection title="The short version">
            SoupyTag does not require a personal account. Photos and annotation text remain on your
            device unless you share an exported image. Optional analytics stays off until you turn
            it on.
          </PolicySection>

          <PolicySection title="Photos and AI tagging">
            In version 1.2.1, Tap and Box are manual tools that run on your device, and AI auto-find
            is not enabled. If an optional AI feature is offered later, SoupyTag will explain the
            processing before you choose to use it. Manual annotation and export do not require AI.
          </PolicySection>

          <PolicySection title="Camera, files, and microphone">
            Camera and file access are used only when you choose a photo or video. Voice dictation
            is handled by the speech service available on your device; SoupyTag does not save an
            audio recording. Your working image, labels, and settings are stored locally so an
            interrupted session can be recovered.
          </PolicySection>

          <PolicySection title="Optional product analytics">
            Analytics is disabled by default. If you opt in, SoupyTag sends anonymous action events
            to PostHog, such as whether onboarding finished, which tagging method was used, and
            whether an export succeeded. We disable session replay and automatic interaction
            capture. Photos, labels, prompts, voice content, email addresses, and feedback messages
            are never included. You can turn analytics off in Settings at any time.
          </PolicySection>

          <PolicySection title="Feedback">
            The feedback form collects a category and message. A reply email is optional. App
            version and device details are attached only when you enable that option. Feedback is
            used for support and product improvement and is scheduled for deletion after 90 days.
          </PolicySection>

          <PolicySection title="Purchases">
            Google Play and RevenueCat process the one-time unlimited unlock. SoupyTag receives the
            entitlement status needed to unlock the feature, but does not receive your full payment
            card details.
          </PolicySection>

          <PolicySection title="Sharing">
            Exported images are shared only when you choose a destination in the Android share
            sheet. The selected destination's privacy policy applies after you share.
          </PolicySection>

          <PolicySection title="Your choices">
            You can clear locally stored SoupyTag data through Android settings, disable analytics
            inside the app, omit contact details from feedback, or request deletion of submitted
            feedback by emailing us.
          </PolicySection>

          <PolicySection title="Children and changes">
            SoupyTag is not directed to children under 13. Material policy changes will be reflected
            here with a new effective date.
          </PolicySection>

          <PolicySection title="Contact">
            Questions or deletion requests can be sent to{" "}
            <a href="mailto:hello@soupytag.company" className="font-bold text-yellow-400 underline">
              hello@soupytag.company
            </a>
            .
          </PolicySection>
        </section>
      </main>
    </div>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-neutral-800 pl-5">
      <h2 className="text-lg font-black text-neutral-100">{title}</h2>
      <p className="mt-2">{children}</p>
    </div>
  );
}
