"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { geocodeCity } from "./geocode";
import type { MapLocation } from "./types";

interface LocationEditorProps {
  current?: MapLocation | null;
  onSave: (loc: MapLocation | null) => Promise<void>;
  onClose: () => void;
}

export function LocationEditor({
  current,
  onSave,
  onClose,
}: LocationEditorProps) {
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
        const result = await geocodeCity(city);
        if (!result) {
          setError(
            "City not found. Try a more specific name or use coordinates."
          );
          setLoading(false);
          return;
        }
        await onSave(result);
      } else {
        const latN = parseFloat(lat);
        const lonN = parseFloat(lon);
        if (isNaN(latN) || isNaN(lonN)) {
          setError("Invalid coordinates.");
          setLoading(false);
          return;
        }
        await onSave({
          lat: latN,
          lon: lonN,
          label: label || `${latN.toFixed(4)}, ${lonN.toFixed(4)}`,
        });
      }
      onClose();
    } catch {
      setError("Failed to save location.");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-background border border-neutral-200 rounded-2xl shadow-xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-primary-600" />
            <h3 className="font-semibold text-foreground">Set Location</h3>
          </div>
          <button
            onClick={onClose}
            className="text-foreground-400 hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-1 mb-4 bg-background-100 rounded-lg p-1">
          {(["city", "coords"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${mode === m ? "bg-background text-foreground shadow-sm" : "text-foreground-500 hover:text-foreground"}`}
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
            className="w-full px-3 py-2 text-sm bg-background-100 border border-neutral-200 rounded-lg outline-none focus:border-primary-400 text-foreground placeholder:text-foreground-400"
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
                className="flex-1 px-3 py-2 text-sm bg-background-100 border border-neutral-200 rounded-lg outline-none focus:border-primary-400 text-foreground placeholder:text-foreground-400"
              />
              <input
                type="number"
                placeholder="Longitude"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-background-100 border border-neutral-200 rounded-lg outline-none focus:border-primary-400 text-foreground placeholder:text-foreground-400"
              />
            </div>
            <input
              type="text"
              placeholder="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background-100 border border-neutral-200 rounded-lg outline-none focus:border-primary-400 text-foreground placeholder:text-foreground-400"
            />
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        {current && (
          <p className="mt-2 text-xs text-foreground-500">
            Current: {current.label} ({current.lat.toFixed(4)},{" "}
            {current.lon.toFixed(4)})
          </p>
        )}
        <div className="flex gap-2 mt-4">
          {current && (
            <button
              onClick={handleClear}
              disabled={loading}
              className="px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg border border-red-200 transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs text-foreground-500 hover:text-foreground rounded-lg border border-neutral-200 transition-colors"
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
