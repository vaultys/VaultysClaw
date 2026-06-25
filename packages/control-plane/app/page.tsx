"use client";

import { useSession } from "next-auth/react";
import { Dashboard } from "@/components/home/Dashboard";
import { LandingPage } from "@/components/home/LandingPage";

export default function Home() {
  const { status } = useSession();

  if (status === "unauthenticated") return <LandingPage />;
  if (status === "loading") return null;

  return <Dashboard />;
}
