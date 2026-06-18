"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

// Dynamically import SwaggerUI to avoid SSR issues
const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export default function ApiDocsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [spec, setSpec] = useState<object | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin =
    (session?.user as { isAdmin?: boolean; isOwner?: boolean } | undefined)
      ?.isAdmin ||
    (session?.user as { isAdmin?: boolean; isOwner?: boolean } | undefined)
      ?.isOwner;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "loading") return;
    if (!isAdmin) {
      router.push("/");
      return;
    }

    fetch("/api/docs/swagger.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load spec: ${r.status}`);
        return r.json();
      })
      .then((data) => setSpec(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, isAdmin, router]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-foreground-500 text-sm">
          Loading API documentation…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-danger-400 text-sm">Error: {error}</div>
      </div>
    );
  }

  if (!spec) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">
          API Documentation
        </h1>
        <div className="swagger-wrapper rounded-xl overflow-hidden border border-neutral-300">
          <SwaggerUI
            spec={spec}
            docExpansion="list"
            defaultModelsExpandDepth={-1}
          />
        </div>
      </div>
    </div>
  );
}
