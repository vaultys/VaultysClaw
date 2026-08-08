"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useState, Fragment } from "react";
import { LogOut, Sun, Moon, Monitor, ChevronDown, ChevronRight, IdCard, User, Check } from "lucide-react";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { useBreadcrumbsState } from "./BreadcrumbContext";
import { cn } from "@/lib/utils";

function shortDid(did: string): string {
  if (did.length <= 20) return did;
  return `${did.slice(0, 10)}…${did.slice(-6)}`;
}

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

export default function TopBar() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const { breadcrumbs } = useBreadcrumbsState();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const did = session?.user?.did ?? "";
  const displayLabel = session?.user?.name || (did ? shortDid(did) : "Account");

  return (
    <header className="flex items-center justify-between h-14 px-4 bg-background border-b border-neutral-200/60 shrink-0">
      <nav className="flex items-center gap-1.5 text-sm min-w-0">
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1;
          return (
            <Fragment key={i}>
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-foreground-400 shrink-0" />}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="text-foreground-500 hover:text-foreground transition-colors truncate"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "truncate",
                    isLast ? "font-semibold text-foreground" : "text-foreground-500"
                  )}
                >
                  {crumb.label}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>

      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors",
            open
              ? "bg-background-200 text-foreground"
              : "text-foreground-700 hover:text-foreground hover:bg-background-200/60"
          )}
        >
          <span className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
            <User className="w-3.5 h-3.5" />
          </span>
          <span className="hidden sm:block max-w-[140px] truncate text-xs">{displayLabel}</span>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open ? "rotate-180" : "")} />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-56 bg-background-100 border border-neutral-300 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-neutral-200">
              <p className="text-xs text-foreground-700 font-medium uppercase tracking-wider mb-0.5">
                Signed in as
              </p>
              {session?.user?.name && (
                <p className="text-xs text-foreground font-medium truncate mb-0.5">
                  {session.user.name}
                </p>
              )}
              <p className="text-xs text-foreground-700 font-mono truncate">{shortDid(did)}</p>
            </div>

            {/* Session-gated only (app/identity/layout.tsx), so this link works for
                anyone signed in — including someone holding neither
                admin_console_access nor portal_access, who is exactly the person
                most likely to want to check what they hold. */}
            <Link
              href="/identity"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 border-b border-neutral-200 px-3 py-2.5 text-sm text-foreground-700 transition-colors hover:bg-background-200 hover:text-foreground"
            >
              <IdCard className="h-4 w-4" />
              My identity
            </Link>

            <div className="px-3 py-2 border-b border-neutral-200">
              <p className="text-xs text-foreground-700 uppercase tracking-wider mb-1.5 font-medium">
                Appearance
              </p>
              <div className="flex gap-1">
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    title={label}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 py-1.5 rounded-lg text-xs transition-colors border",
                      theme === value
                        ? "bg-primary-100 border-primary-300 text-primary-700"
                        : "border-transparent text-foreground-700 hover:text-foreground hover:bg-background-200"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                    {theme === value && <Check className="w-2.5 h-2.5 text-primary-700 absolute" />}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-danger-500 hover:text-danger-600 hover:bg-danger-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
