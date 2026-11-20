"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { resolveCityLocationAction } from "@/app/admin/actors/actions";
import type { MapLocation } from "./types";

interface LocationEditorProps {
  current?: MapLocation | null;
  onSave: (loc: MapLocation | null) => Promise<void>;
  onClose: () => void;
}

export function LocationEditor({ current, onSave, onClose }: LocationEditorProps) {
  const [mode, setMode] = useState<"city" | "coords">("city");
  const [city, setCity] = useState("");
  const [lat, setLat] = useState(current?.lat?.toString() ?? "");
  const [lon, setLon] = useState(current?.lon?.toString() ?? "");
  const [label, setLabel] = useState(current?.label ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "city") {
        const result = await resolveCityLocationAction(city);
        if (!result) {
          setError("City not found. Try a more specific name or use coordinates.");
          setLoading(false);
          return;
        }
        await onSave(result);
      } else {
        const latN = parseFloat(lat);
        const lonN = parseFloat(lon);
        if (isNaN(latN) || isNaN(lonN)) {
          setError("Invalid coordinates");
          setLoading(false);
          return;
        }
        await onSave({ lat: latN, lon: lonN, label: label || `${latN.toFixed(4)}, ${lonN.toFixed(4)}` });
      }
      onClose();
    } catch {
      setError("Could not save the location");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    try {
      await onSave(null);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-neutral-200 rounded-xl shadow-lg w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MapPin size={16} strokeWidth={1.5} className="text-foreground-500" />
            <h3 className="text-sm font-medium text-foreground">Set location</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-foreground-500 transition-colors hover:text-foreground"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex gap-1 mb-4 rounded-lg border border-neutral-200/60 bg-background-100 p-1">
          {(["city", "coords"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${mode === m ? "bg-background-200 text-foreground" : "text-foreground-500 hover:text-foreground"}`}
            >
              {m === "city" ? "City name" : "Coordinates"}
            </button>
          ))}
        </div>
        {mode === "city" ? (
          <input
            type="text"
            placeholder="e.g. Paris, France"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="w-full px-3 py-2 text-sm bg-background border border-neutral-200 rounded-lg text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            autoFocus
          />
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Latitude"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-background border border-neutral-200 rounded-lg text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
              />
              <input
                type="number"
                placeholder="Longitude"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-background border border-neutral-200 rounded-lg text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
              />
            </div>
            <input
              type="text"
              placeholder="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-neutral-200 rounded-lg text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            />
          </div>
        )}
        {error && <p className="mt-2 text-xs text-danger-700">{error}</p>}
        {current && (
          <p className="mt-2 text-xs text-foreground-500">
            Current: {current.label}{" "}
            <span className="font-mono tabular-nums">
              ({current.lat.toFixed(4)}, {current.lon.toFixed(4)})
            </span>
          </p>
        )}
        <div className="flex gap-2 mt-4">
          {current && (
            <button
              onClick={handleClear}
              disabled={loading}
              className="px-3 py-2 text-xs font-medium text-danger-700 bg-background-100 hover:bg-background-200 rounded-lg border border-neutral-200 transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs font-medium text-foreground bg-background-100 hover:bg-background-200 rounded-lg border border-neutral-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || (mode === "city" ? !city.trim() : !lat || !lon)}
            className="px-4 py-2 text-xs bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
