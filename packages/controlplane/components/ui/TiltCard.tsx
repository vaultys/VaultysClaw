"use client";

import { useRef, useState, type ReactNode, type MouseEvent } from "react";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  perspective?: number;
  scale?: number;
  speed?: number;
  easing?: string;
  glare?: boolean;
  maxGlare?: number;
  glareColor?: string;
}

export default function TiltCard({
  children,
  className = "",
  maxTilt = 8,
  perspective = 1000,
  scale = 1.02,
  speed = 300,
  easing = "cubic-bezier(0.03, 0.98, 0.52, 0.99)",
  glare = true,
  maxGlare = 0.15,
  glareColor = "rgba(255, 255, 255, 0.1)",
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [glareStyle, setGlareStyle] = useState<React.CSSProperties>({});

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const deltaX = (x - centerX) / centerX;
    const deltaY = (y - centerY) / centerY;

    const tiltX = deltaY * maxTilt;
    const tiltY = -deltaX * maxTilt;

    const rotateX = tiltX.toFixed(2);
    const rotateY = tiltY.toFixed(2);

    setStyle({
      transform: `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale}, ${scale}, ${scale})`,
      transition: `transform ${speed}ms ${easing}`,
      transformStyle: "preserve-3d",
    });

    if (glare) {
      const glareAngle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), 1);
      const opacity = (distance * maxGlare).toFixed(3);

      setGlareStyle({
        background: `linear-gradient(${glareAngle}deg, ${glareColor} 0%, transparent 100%)`,
        opacity: opacity,
      });
    }
  };

  const handleMouseLeave = () => {
    setStyle({
      transform: `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
      transition: `transform ${speed}ms ${easing}`,
      transformStyle: "preserve-3d",
    });
    setGlareStyle({ opacity: "0" });
  };

  return (
    <div
      ref={cardRef}
      className={`relative overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transformStyle: "preserve-3d",
        ...style,
      }}
    >
      {glare && (
        <div
          className="pointer-events-none absolute inset-0 rounded-inherit"
          style={{
            ...glareStyle,
            transition: `opacity ${speed}ms ${easing}, background ${speed}ms ${easing}`,
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
      )}
      <div className="relative z-10" style={{ transform: "translateZ(20px)" }}>
        {children}
      </div>
    </div>
  );
}