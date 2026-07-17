"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LandingPage } from "@/components/home/LandingPage";

/**
 * Marketing root. Anonymous visitors see the landing page. Authenticated users
 * are redirected to /app/dashboard — the proxy handles this server-side for full
 * page loads; the client-side effect below covers in-app navigations to "/".
 */
export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/app/dashboard");
  }, [status, router]);

  if (status === "unauthenticated") return <LandingPage />;
  return null;
}
