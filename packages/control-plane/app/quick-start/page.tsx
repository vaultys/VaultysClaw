import { ExternalLink, ShieldAlert } from "lucide-react";

export default function QuickStartPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        {/* Header */}
        <header className="flex items-center gap-3">
          <div className="w-11 h-11 bg-primary-600 rounded-xl flex items-center justify-center text-xl shadow-lg shadow-primary-600/20">
            🦞
          </div>
          <div>
            <h1 className="text-2xl font-bold">Quick Start</h1>
            <p className="text-sm text-foreground-500 mt-0.5">
              Get VaultysClaw running and explore it in minutes.
            </p>
          </div>
        </header>

        {/* Chapter 1 — First Login */}
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold tracking-wider uppercase text-primary-500">
              Chapter 1
            </span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>

          <h2 className="text-xl font-bold">First Login</h2>

          {/* Open control plane */}
          <a
            href="http://localhost:3000"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-xl transition-colors"
          >
            Open the control plane
            <ExternalLink className="w-4 h-4" />
          </a>

          {/* Explanations */}
          <div className="space-y-4 text-foreground-600 leading-relaxed">
            <p>
              For this quick start, you&apos;ll sign in{" "}
              <strong className="text-foreground">
                without the VaultysID app
              </strong>{" "}
              — a simplified, fast way to get going. This is{" "}
              <strong className="text-foreground">less secure</strong> and should{" "}
              <strong className="text-foreground">
                not be used in production
              </strong>
              ; it&apos;s ideal for testing the solution.
            </p>
            <p>
              You&apos;ll also choose{" "}
              <strong className="text-foreground">Software</strong> security (no
              passkey, no hardware key) — again, less secure, but simpler and
              faster to set up.
            </p>

            <div className="flex items-start gap-3 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-xl p-4">
              <ShieldAlert className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" />
              <p className="text-sm text-foreground-600">
                Anyone with access to this browser can sign in with this method.
                Use it only for local testing — never on a public or production
                deployment.
              </p>
            </div>
          </div>

          {/* Walkthrough video */}
          <figure className="space-y-2">
            <div className="rounded-2xl overflow-hidden border border-neutral-200 shadow-sm bg-black">
              <video
                controls
                playsInline
                preload="metadata"
                className="w-full h-auto block"
              >
                <source src="/login-quick-start.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
            <figcaption className="text-xs text-foreground-400 text-center">
              Logging in without the VaultysID app
            </figcaption>
          </figure>
        </section>
      </div>
    </div>
  );
}
