"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CompleteProfileProps {
  readonly onSubmit: (name: string, email: string) => void;
  readonly saving: boolean;
  readonly error: string | null;
}

/**
 * Shown right after a brand-new VaultysId user registers. Name and email are
 * both required before the user can enter the app.
 */
export default function CompleteProfile({
  onSubmit,
  saving,
  error,
}: CompleteProfileProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);

  const nameValid = name.trim().length > 0;
  const emailValid = EMAIL_RE.test(email.trim());
  const valid = nameValid && emailValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || saving) return;
    onSubmit(name.trim(), email.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-primary-100 border border-primary-200 flex items-center justify-center mx-auto">
          <UserPlus className="w-6 h-6 text-primary-600" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          Complete your profile
        </h1>
        <p className="text-foreground-500 text-sm">
          Tell us your name and email to finish setting up your account.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="profile-name"
            className="block text-xs font-medium text-foreground-500 mb-1"
          >
            Name <span className="text-danger-500">*</span>
          </label>
          <input
            id="profile-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className="w-full bg-background border border-neutral-200 rounded-lg px-3 py-2 text-sm text-foreground placeholder-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {touched && !nameValid && (
            <p className="text-xs text-danger-500 mt-1">Name is required</p>
          )}
        </div>

        <div>
          <label
            htmlFor="profile-email"
            className="block text-xs font-medium text-foreground-500 mb-1"
          >
            Email <span className="text-danger-500">*</span>
          </label>
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-background border border-neutral-200 rounded-lg px-3 py-2 text-sm text-foreground placeholder-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {touched && !emailValid && (
            <p className="text-xs text-danger-500 mt-1">
              A valid email is required
            </p>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-danger-500 text-center">{error}</p>}

      <button
        type="submit"
        disabled={saving || !valid}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Saving…
          </>
        ) : (
          "Continue"
        )}
      </button>
    </form>
  );
}
