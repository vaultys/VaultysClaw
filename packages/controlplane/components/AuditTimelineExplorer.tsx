"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditTimelinePoint {
  createdAt: string;
}

interface Bucket {
  key: string;
  label: string;
  start: number;
  end: number;
  count: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOURLY_THRESHOLD_MS = 3 * DAY_MS;
const MAX_BARS = 64;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

function toPeriodParam(ms: number, unitMs: number): string {
  const iso = new Date(ms).toISOString();
  return unitMs === HOUR_MS ? iso.slice(0, 13) : iso.slice(0, 10);
}

function dayStart(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function hourStart(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours()
  );
}

function parseDateParam(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const normalized =
    value.length === 13 ? `${value}:00:00.000Z` : `${value}T00:00:00.000Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function labelFor(ms: number, spanMs: number, unitMs: number): string {
  const date = new Date(ms);
  if (unitMs === HOUR_MS) {
    return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${String(date.getUTCHours()).padStart(2, "0")}:00`;
  }
  if (spanMs > 370 * DAY_MS) {
    return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function rangeLabel(start: number, end: number, unitMs: number): string {
  if (unitMs === HOUR_MS) {
    return `${labelFor(start, HOUR_MS, unitMs)} to ${labelFor(end, HOUR_MS, unitMs)}`;
  }
  return `${toPeriodParam(start, unitMs)} to ${toPeriodParam(end, unitMs)}`;
}

function timelineExtent(points: AuditTimelinePoint[]): { min: number; max: number } | null {
  if (points.length === 0) return null;
  const times = points.map((point) => new Date(point.createdAt).getTime()).sort((a, b) => a - b);
  return { min: times[0], max: times[times.length - 1] };
}

function buildBuckets(points: AuditTimelinePoint[], unitMs: number): Bucket[] {
  const extent = timelineExtent(points);
  if (!extent) return [];

  const times = points
    .map((point) => {
      const time = new Date(point.createdAt).getTime();
      return unitMs === HOUR_MS ? hourStart(time) : dayStart(time);
    })
    .sort((a, b) => a - b);
  const min = unitMs === HOUR_MS ? hourStart(extent.min) : dayStart(extent.min);
  const max = unitMs === HOUR_MS ? hourStart(extent.max) : dayStart(extent.max);
  const span = Math.max(max - min, DAY_MS);
  const bucketMs =
    unitMs === HOUR_MS
      ? Math.max(HOUR_MS, Math.ceil(span / MAX_BARS / HOUR_MS) * HOUR_MS)
      : Math.max(DAY_MS, Math.ceil(span / MAX_BARS / DAY_MS) * DAY_MS);
  const counts = new Map<number, number>();

  for (const time of times) {
    const start = min + Math.floor((time - min) / bucketMs) * bucketMs;
    counts.set(start, (counts.get(start) ?? 0) + 1);
  }

  const buckets: Bucket[] = [];
  for (let start = min; start <= max; start += bucketMs) {
    buckets.push({
      key: String(start),
      label: labelFor(start, span, unitMs),
      start,
      end: start + bucketMs,
      count: counts.get(start) ?? 0,
    });
  }

  return buckets;
}

export default function AuditTimelineExplorer({
  points,
  total,
  selectedTotal,
  from,
  to,
}: {
  points: AuditTimelinePoint[];
  total: number;
  selectedTotal: number;
  from?: string;
  to?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const trackRef = useRef<HTMLDivElement>(null);
  const extent = useMemo(() => timelineExtent(points), [points]);
  const spanMs = extent ? Math.max(extent.max - extent.min, HOUR_MS) : DAY_MS;
  const unitMs = spanMs <= HOURLY_THRESHOLD_MS ? HOUR_MS : DAY_MS;
  const buckets = useMemo(() => buildBuckets(points, unitMs), [points, unitMs]);
  const fallbackStart = Date.UTC(2026, 0, 1);
  const fallbackEnd = fallbackStart + DAY_MS;
  const minTime =
    buckets[0]?.start ?? (extent ? (unitMs === HOUR_MS ? hourStart(extent.min) : dayStart(extent.min)) : fallbackStart);
  const maxTime =
    buckets.at(-1)?.start ?? (extent ? (unitMs === HOUR_MS ? hourStart(extent.max) : dayStart(extent.max)) : fallbackEnd);
  const timelineEnd = maxTime + unitMs;
  const [start, setStart] = useState(() => parseDateParam(from, minTime));
  const [end, setEnd] = useState(() => parseDateParam(to, maxTime));
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const selectedStart = Math.min(start, end);
  const selectedEnd = Math.max(start, end);
  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const selectedEstimate = buckets.reduce((sum, bucket) => {
    const overlapsSelection = bucket.end > selectedStart && bucket.start <= selectedEnd;
    return overlapsSelection ? sum + bucket.count : sum;
  }, 0);
  const selectedLeft =
    timelineEnd === minTime ? 0 : ((selectedStart - minTime) / (timelineEnd - minTime)) * 100;
  const selectedRight =
    timelineEnd === minTime
      ? 0
      : 100 - ((selectedEnd + unitMs - minTime) / (timelineEnd - minTime)) * 100;
  const selectedLabel = dragging ? selectedEstimate : from || to ? selectedTotal : total;

  useEffect(() => {
    setStart(parseDateParam(from, minTime));
    setEnd(parseDateParam(to, maxTime));
  }, [from, maxTime, minTime, to]);

  function applyPeriod(nextStart = selectedStart, nextEnd = selectedEnd) {
    const params = new URLSearchParams(searchParams);
    params.set("from", toPeriodParam(nextStart, unitMs));
    params.set("to", toPeriodParam(nextEnd, unitMs));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clearPeriod() {
    const params = new URLSearchParams(searchParams);
    params.delete("from");
    params.delete("to");
    router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname, {
      scroll: false,
    });
  }

  function valueFromClientX(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return selectedStart;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = minTime + ratio * (timelineEnd - minTime);
    return Math.min(maxTime, Math.max(minTime, Math.round(raw / unitMs) * unitMs));
  }

  useEffect(() => {
    if (!dragging) return;
    function onPointerMove(event: PointerEvent) {
      const next = valueFromClientX(event.clientX);
      if (dragging === "start") setStart(next);
      else setEnd(next);
    }

    function onPointerUp(event: PointerEvent) {
      const next = valueFromClientX(event.clientX);
      const nextStart = dragging === "start" ? next : selectedStart;
      const nextEnd = dragging === "end" ? next : selectedEnd;
      if (dragging === "start") setStart(next);
      else setEnd(next);
      setDragging(null);
      applyPeriod(nextStart, nextEnd);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  });

  return (
    <section className="overflow-hidden rounded-2xl border border-primary-200/70 bg-background-100 shadow-xl shadow-primary-900/5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white shadow-lg shadow-primary-600/20">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Audit explorer</h2>
            <p className="text-xs text-foreground-500">
              Drag the handles to inspect activity by period.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-background px-3 py-1.5 text-sm text-foreground">
          <SlidersHorizontal className="h-4 w-4 text-primary-600" />
          <span className="font-semibold">{selectedLabel}</span>
          <span className="text-foreground-500">of {total} logs</span>
        </div>
      </div>

      <div className="px-5 py-5">
        <div ref={trackRef} className="relative h-28 border-b border-neutral-200/70">
          <div
            className="absolute inset-y-0 rounded-lg bg-primary-100/60"
            style={{ left: `${selectedLeft}%`, right: `${selectedRight}%` }}
          />
          <div className="absolute inset-x-0 bottom-0 flex h-24 items-end gap-1">
            {buckets.length === 0 && (
              <div className="flex h-full w-full items-center justify-center text-sm text-foreground-400">
                No audit events yet.
              </div>
            )}
            {buckets.map((bucket) => {
              const active = bucket.end > selectedStart && bucket.start <= selectedEnd;
              return (
                <div
                  key={bucket.key}
                  title={`${bucket.label}: ${bucket.count} log${bucket.count === 1 ? "" : "s"}`}
                  className={cn(
                    "min-w-0 flex-1 rounded-t transition-colors",
                    active ? "bg-primary-500" : "bg-background-300"
                  )}
                  style={{ height: `${Math.max(8, (bucket.count / maxCount) * 96)}px` }}
                />
              );
            })}
          </div>
          {(["start", "end"] as const).map((handle) => {
            const isStart = handle === "start";
            const value = isStart ? selectedStart : selectedEnd;
            const visualValue = isStart ? value : value + unitMs;
            const left =
              timelineEnd === minTime ? 0 : ((visualValue - minTime) / (timelineEnd - minTime)) * 100;
            return (
              <button
                key={handle}
                type="button"
                role="slider"
                aria-label={isStart ? "Start date" : "End date"}
                aria-valuemin={minTime}
                aria-valuemax={maxTime}
                aria-valuenow={value}
                aria-valuetext={toPeriodParam(value, unitMs)}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragging(handle);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  const delta = event.key === "ArrowLeft" ? -unitMs : unitMs;
                  const next = Math.min(maxTime, Math.max(minTime, value + delta));
                  if (isStart) setStart(next);
                  else setEnd(next);
                  applyPeriod(isStart ? next : selectedStart, isStart ? selectedEnd : next);
                }}
                className="absolute top-1/2 z-30 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary-200 bg-background text-primary-700 shadow-lg shadow-primary-900/15 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary-400"
                style={{ left: `${left}%` }}
              >
                <span className="h-4 w-1 rounded-full bg-primary-500" />
                <span className="ml-0.5 h-4 w-1 rounded-full bg-primary-500" />
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-foreground-500">
          <div className="flex flex-wrap items-center gap-2">
            <span>{labelFor(minTime, maxTime - minTime, unitMs)}</span>
            <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 font-medium text-primary-700">
              {rangeLabel(selectedStart, selectedEnd, unitMs)}
            </span>
            <span>{labelFor(maxTime, maxTime - minTime, unitMs)}</span>
          </div>
          <button
            type="button"
            onClick={clearPeriod}
            disabled={!from && !to}
            className="font-medium text-primary-600 hover:underline disabled:text-foreground-300 disabled:no-underline"
          >
            All time
          </button>
        </div>
      </div>
    </section>
  );
}
