"use client";

import AnimatedCounter from "./AnimatedCounter";

interface StatCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  sublabel?: string;
  icon: React.ReactNode;
  color?: string;
  delay?: number;
}

export default function StatCard({
  label,
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  sublabel,
  icon,
  color,
  delay = 0,
}: StatCardProps) {
  return (
    <div
      className="md-card flex items-start gap-4 animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: color || "var(--md-primary-container)",
          color: "var(--md-on-primary-container)",
        }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: "var(--md-on-surface-variant)" }}>
          {label}
        </p>
        <AnimatedCounter
          value={value}
          prefix={prefix}
          suffix={suffix}
          decimals={decimals}
          className="text-2xl font-semibold tracking-tight block"
        />
        {sublabel && (
          <p className="text-xs mt-0.5" style={{ color: "var(--md-on-surface-variant)" }}>
            {sublabel}
          </p>
        )}
      </div>
    </div>
  );
}
