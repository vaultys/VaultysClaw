"use client";

import { signIn } from "next-auth/react";

interface OidcLoginButtonProps {
  providerName: string;
}

export default function OidcLoginButton({ providerName }: OidcLoginButtonProps) {
  return (
    <button
      onClick={() => {
        const cb = new URLSearchParams(window.location.search).get(
          "callbackUrl"
        );
        const callbackUrl = cb && cb.startsWith("/") && !cb.startsWith("//") ? cb : "/";
        void signIn("oidc", { callbackUrl });
      }}
      className="flex items-center gap-2 px-4 py-2 vc-bg-surface hover:bg-background-200 border vc-border hover:border-primary-300 vc-text text-sm font-medium rounded-xl transition-colors backdrop-blur-sm shadow-sm"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
      </svg>
      Sign in with {providerName}
    </button>
  );
}
