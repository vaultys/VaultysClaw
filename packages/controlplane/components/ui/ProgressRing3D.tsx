"use client";

import { useRef, useEffect, useState } from "react";

interface ProgressRing3DProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  trackColor?: string;
  progressColor?: string;
  showPercentage?: boolean;
}

export default function ProgressRing3D({
  progress,
  size = 80,
  strokeWidth = 8,
  className = "",
  trackColor = "rgb(var(--neutral-200) / 0.5)",
  progressColor = "rgb(var(--primary-600))",
  showPercentage = true,
}: ProgressRing3DProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const circleRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const duration = 1000;
    const startTime = Date.now();
    const startProgress = animatedProgress;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedProgress(startProgress + (progress - startProgress) * eased);

      if (t < 1) {
        setTimeout(() => requestAnimationFrame(animate), 100);
      }
    };

    animate();
  }, [progress, animatedProgress]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedProgress / 100) * circumference;

  return (
    <div className={`relative inline-flex ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <filter id="progress-ring-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={progressColor} floodOpacity="0.3" />
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          className="transition-all duration-300"
        />
        <circle
          ref={circleRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            filter: "url(#progress-ring-shadow)",
            transition: "stroke-dashoffset 0.3s ease-out",
          }}
        />
      </svg>
      {showPercentage && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: "translateZ(20px)",
          }}
        >
          <span className="text-xl font-bold text-foreground">
            {Math.round(animatedProgress)}%
          </span>
        </div>
      )}
    </div>
  );
}