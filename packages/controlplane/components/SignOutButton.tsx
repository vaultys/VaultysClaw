"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-sm text-foreground-500 hover:text-danger-600 transition-colors"
    >
      Sign out
    </button>
  );
}
