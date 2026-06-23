"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/hooks/useRole";
import { GraphExplorer } from "@/components/graph/GraphExplorer";

export default function FullGraphPage() {
  const router = useRouter();
  const { isGlobalAdmin, isLoading } = useRole();

  useEffect(() => {
    if (!isLoading && !isGlobalAdmin) router.replace("/");
  }, [isLoading, isGlobalAdmin, router]);

  if (isLoading || !isGlobalAdmin) return null;

  return <GraphExplorer />;
}
