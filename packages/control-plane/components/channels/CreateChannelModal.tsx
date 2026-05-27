"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";

interface Realm {
  id: string;
  name: string;
  slug: string;
}

interface CreateChannelModalProps {
  onClose: () => void;
  onChannelCreated: (channel: any) => void;
  preSelectedRealmId?: string;
}

export default function CreateChannelModal({
  onClose,
  onChannelCreated,
  preSelectedRealmId,
}: CreateChannelModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [realms, setRealms] = useState<Realm[]>([]);
  const [selectedRealmId, setSelectedRealmId] = useState<string>(preSelectedRealmId ?? "");
  const [isLoadingRealms, setIsLoadingRealms] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRealms = async () => {
      try {
        setIsLoadingRealms(true);
        const response = await fetch("/api/me/realms");
        if (response.ok) {
          const data = (await response.json()) as { realms: Realm[] };
          setRealms(data.realms);
          // Auto-select first realm only if no preSelectedRealmId was provided
          if (!preSelectedRealmId && data.realms.length > 0) {
            setSelectedRealmId(data.realms[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch realms:", err);
      } finally {
        setIsLoadingRealms(false);
      }
    };

    fetchRealms();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Channel name is required");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Generate slug from name
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug,
          realmId: selectedRealmId || undefined, // undefined = global channel
          description: description.trim() || undefined,
          isPublic,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create channel");
      }

      const data = await response.json();
      onChannelCreated(data.channel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-vc-surface rounded-lg w-full max-w-md p-6 border border-vc-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-vc-text">Create Channel</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-vc-raised rounded-lg transition text-vc-text-2"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-vc-text mb-2">
              Organization
            </label>
            {isLoadingRealms ? (
              <div className="flex items-center gap-2 px-4 py-2 text-vc-text-2 text-sm">
                <Loader2 size={14} className="animate-spin" />
                Loading organizations...
              </div>
            ) : realms.length === 0 ? (
              <div className="px-4 py-2 text-vc-text-2 text-sm bg-vc-surface rounded-lg border border-vc-border">
                No organizations found. Create a global channel.
              </div>
            ) : (
              <select
                value={selectedRealmId}
                onChange={(e) => setSelectedRealmId(e.target.value)}
                className="w-full bg-vc-bg border border-vc-border rounded-lg px-4 py-2 text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Global Channel</option>
                {realms.map((realm) => (
                  <option key={realm.id} value={realm.id}>
                    {realm.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-vc-text mb-2">
              Channel Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., engineering, marketing, general"
              className="w-full bg-vc-bg border border-vc-border rounded-lg px-4 py-2 text-vc-text placeholder-vc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-vc-text mb-2">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel for?"
              className="w-full bg-vc-bg border border-vc-border rounded-lg px-4 py-2 text-vc-text placeholder-vc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="isPublic" className="text-sm text-vc-text-2">
              Public channel (anyone can join)
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-vc-raised hover:bg-vc-surface text-vc-text rounded-lg transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-vc-muted disabled:cursor-not-allowed text-white rounded-lg transition font-medium flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
