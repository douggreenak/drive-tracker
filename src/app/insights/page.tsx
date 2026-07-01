"use client";

import { useEffect, useState } from "react";

interface MonthPoint {
  label: string;
  key: string;
  spent: number;
  miles: number;
  gallons: number;
  trips: number;
  selfPaid: number;
  parentsPaid: number;
  mpg: number;
}
interface Analytics {
  monthly: MonthPoint[];
  byVehicle: { name: string; spent: number; gallons: number }[];
  byFuel: { type: string; spent: number; gallons: number }[];
  byCategory: { category: string; trips: number; miles: number }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  COMMUTE: "Commute", ERRAND: "Errand", ROAD_TRIP: "Road Trip",
  SCHOOL: "School", WORK: "Work", LEISURE: "Leisure", OTHER: "Other",
};
const FUEL_LABELS: Record<string, string> = {
  REGULAR: "Regular", MIDGRADE: "Midgrade", PREMIUM: "Premium", DIESEL: "Diesel",
};

type Metric = "spent" | "miles" | "gallons" | "mpg";
const METRICS: { key: Metric; label: string; prefix?: string; suffix?: string }[] = [
  { key: "spent", label: "Spending", prefix: "$" },
  { key: "miles", label: "Miles" },
  { key: "gallons", label: "Gallons" },
  { key: "mpg", label: "MPG" },
];

export default function InsightsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [metric, setMetric] = useState<Metric>("spent");

  useEffect(() => {
    fetch("/api/analytics").then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="skeleton h-8 w-40 rounded mb-6" />
        <div className="skeleton h-64 w-full rounded-2xl mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="skeleton h-48 rounded-2xl" />
          <div className="skeleton h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  const active = METRICS.find((m) => m.key === metric)!;
  const fmt = (n: number) => `${active.prefix ?? ""}${metric === "spent" ? n.toFixed(2) : n}${active.suffix ?? ""}`;
  const totalSpent = data.byVehicle.reduce((s, v) => s + v.spent, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto page-enter">
      <div className="mb-6 animate-fade-in-up">
        <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
          Trends over the last 12 months
        </p>
      </div>

      {/* Monthly trend */}
      <div className="md-card mb-6 animate-fade-in-up" style={{ animationDelay: "40ms" }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-medium" style={{ color: "var(--md-on-surface-variant)" }}>
            Monthly {active.label}
          </h3>
          <div className="flex gap-1">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`md-chip ${metric === m.key ? "active" : ""}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <BarChart points={data.monthly.map((p) => ({ label: p.label, value: p[metric] }))} format={fmt} />
      </div>

      {/* Who's paying, stacked by month */}
      <div className="md-card mb-6 animate-fade-in-up" style={{ animationDelay: "80ms" }}>
        <h3 className="text-sm font-medium mb-4" style={{ color: "var(--md-on-surface-variant)" }}>
          Who&apos;s paying for gas
        </h3>
        <StackedPaidBy points={data.monthly} />
        <div className="flex gap-4 mt-3 text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
          <Legend color="var(--md-primary)" label="Me" />
          <Legend color="var(--md-tertiary)" label="Parents" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By vehicle */}
        <div className="md-card animate-fade-in-up" style={{ animationDelay: "120ms" }}>
          <h3 className="text-sm font-medium mb-4" style={{ color: "var(--md-on-surface-variant)" }}>
            Spending by vehicle
          </h3>
          {data.byVehicle.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-3">
              {data.byVehicle.map((v) => (
                <RowBar key={v.name} label={v.name} value={v.spent} total={totalSpent}
                        display={`$${v.spent.toFixed(2)}`} sub={`${v.gallons} gal`} />
              ))}
            </div>
          )}
        </div>

        {/* By category */}
        <div className="md-card animate-fade-in-up" style={{ animationDelay: "150ms" }}>
          <h3 className="text-sm font-medium mb-4" style={{ color: "var(--md-on-surface-variant)" }}>
            Miles by category
          </h3>
          {data.byCategory.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-3">
              {data.byCategory.map((c) => {
                const max = Math.max(...data.byCategory.map((x) => x.miles), 1);
                return (
                  <RowBar key={c.category} label={CATEGORY_LABELS[c.category] || c.category}
                          value={c.miles} total={max} display={`${c.miles} mi`}
                          sub={`${c.trips} ${c.trips === 1 ? "trip" : "trips"}`} color="var(--md-tertiary)" />
                );
              })}
            </div>
          )}
        </div>

        {/* By fuel type */}
        <div className="md-card animate-fade-in-up md:col-span-2" style={{ animationDelay: "180ms" }}>
          <h3 className="text-sm font-medium mb-4" style={{ color: "var(--md-on-surface-variant)" }}>
            Spending by fuel grade
          </h3>
          {data.byFuel.length === 0 ? (
            <Empty />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.byFuel.map((f) => (
                <div key={f.type} className="rounded-xl p-3" style={{ background: "var(--md-surface-container-high)" }}>
                  <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>{FUEL_LABELS[f.type] || f.type}</p>
                  <p className="text-lg font-semibold mt-0.5">${f.spent.toFixed(2)}</p>
                  <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>{f.gallons} gal</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BarChart({ points, format }: { points: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-52">
      {points.map((p, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 group h-full justify-end">
          <span className="text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            {format(p.value)}
          </span>
          <div
            className="w-full rounded-t-md animate-progress"
            style={{
              height: `${(p.value / max) * 100}%`,
              minHeight: p.value > 0 ? "4px" : "0",
              background: "var(--md-primary)",
              animationDelay: `${i * 25}ms`,
            }}
            title={format(p.value)}
          />
          <span className="text-[10px]" style={{ color: "var(--md-on-surface-variant)" }}>{p.label}</span>
        </div>
      ))}
    </div>
  );
}

function StackedPaidBy({ points }: { points: MonthPoint[] }) {
  const max = Math.max(...points.map((p) => p.selfPaid + p.parentsPaid), 1);
  return (
    <div className="flex items-end gap-1.5 h-40">
      {points.map((p, i) => {
        const total = p.selfPaid + p.parentsPaid;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`$${total.toFixed(2)}`}>
            <div className="w-full flex flex-col justify-end rounded-t-md overflow-hidden" style={{ height: `${(total / max) * 100}%`, minHeight: total > 0 ? "3px" : "0" }}>
              <div style={{ height: `${total > 0 ? (p.parentsPaid / total) * 100 : 0}%`, background: "var(--md-tertiary)" }} />
              <div style={{ height: `${total > 0 ? (p.selfPaid / total) * 100 : 0}%`, background: "var(--md-primary)" }} />
            </div>
            <span className="text-[10px]" style={{ color: "var(--md-on-surface-variant)" }}>{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function RowBar({ label, value, total, display, sub, color = "var(--md-primary)" }: {
  label: string; value: number; total: number; display: string; sub?: string; color?: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-semibold">{display}{sub ? <span className="text-xs font-normal ml-1" style={{ color: "var(--md-on-surface-variant)" }}>· {sub}</span> : null}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--md-surface-container-high)" }}>
        <div className="h-full rounded-full animate-progress" style={{ width: `${total > 0 ? (value / total) * 100 : 0}%`, background: color }} />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function Empty() {
  return <p className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>No data yet.</p>;
}
