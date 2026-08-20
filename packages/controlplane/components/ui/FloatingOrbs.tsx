"use client";

import { useEffect, useRef, useState, useMemo } from "react";

const DEFAULT_COLORS = [
  "rgb(var(--primary-500) / 0.08)",
  "rgb(var(--secondary-500) / 0.08)",
  "rgb(var(--success-500) / 0.08)",
  "rgb(var(--warning-500) / 0.08)",
];

interface FloatingOrbsProps {
  className?: string;
  count?: number;
  colors?: string[];
  blur?: number;
  speed?: number;
}

export default function FloatingOrbs({
  className = "",
  count = 4,
  colors = DEFAULT_COLORS,
  blur = 80,
  speed = 20,
}: FloatingOrbsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [orbs, setOrbs] = useState<
    Array<{ x: number; y: number; size: number; color: string; delay: number; duration: number }>
  >([]);

  const resolvedColors = useMemo(() => colors, [colors.join(",")]);

  useEffect(() => {
    const newOrbs = Array.from({ length: count }, (_, i) => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 200 + 150,
      color: resolvedColors[i % resolvedColors.length],
      delay: Math.random() * 5,
      duration: Math.random() * 10 + 15,
    }));
    setOrbs(newOrbs);
  }, [count, resolvedColors]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationId: number;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;

      setOrbs((prev) =>
        prev.map((orb, i) => {
          const angle = (elapsed + orb.delay) * (Math.PI * 2) / orb.duration;
          const radius = 15 + Math.sin(elapsed * 0.3 + i) * 8;
          const centerX = 50;
          const centerY = 50;

          return {
            ...orb,
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
          };
        })
      );

      animationId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animationId);
  }, [orbs.length]);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {orbs.map((orb, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${orb.x}%`,
            top: `${orb.y}%`,
            width: `${orb.size}px`,
            height: `${orb.size}px`,
            background: orb.color,
            filter: `blur(${blur}px)`,
            transform: "translate(-50%, -50%)",
            transition: "left 0.3s ease-out, top 0.3s ease-out",
            willChange: "left, top",
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}