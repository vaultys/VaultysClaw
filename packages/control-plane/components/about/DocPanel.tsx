"use client";
import { useState, useEffect } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { MarkdownDoc } from "@/components/shared/md/MarkdownDoc";
import { aboutClient, unwrap } from "@/lib/api/ts-rest/client";

export function DocPanel() {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    aboutClient
      .get({
        query: { doc: "zerotrust" },
      })
      .then((r) => unwrap(r))
      .then((d) => setContent(d.content))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 bg-danger-50 border border-danger-300 rounded-xl px-4 py-3 text-sm text-danger-700">
        <AlertTriangle size={14} className="shrink-0" />
        {error}
      </div>
    );
  }

  return (
    <div className="bg-background-100 border border-neutral-200 rounded-2xl px-8 py-7">
      <MarkdownDoc content={content ?? ""} />
    </div>
  );
}
