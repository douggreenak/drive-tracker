"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import { SkeletonDashboard } from "@/components/Skeleton";

interface Stats {
  totalTrips: number;
  totalMiles: number;
  totalGallons: number;
  totalSpent: number;
  selfPaid: number;
  parentsPaid: number;
  avgMpg: number;
  costPerMile: number;
  avgPricePerGallon: number;
  monthlySpent: number;
  weeklyMiles: number;
  weeklyTrips: number;
  categoryCounts: Record<string, number>;
  monthlyBudget: number;
  favoriteCount: number;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const CATEGORY_LABELS: Record<string, string> = {
  COMMUTE: "Commute",
  ERRAND: "Errand",
  ROAD_TRIP: "Road Trip",
  SCHOOL: "School",
  WORK: "Work",
  LEISURE: "Leisure",
  OTHER: "Other",
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() =>
        setStats({
          totalTrips: 0, totalMiles: 0, totalGallons: 0, totalSpent: 0,
          selfPaid: 0, parentsPaid: 0, avgMpg: 0, costPerMile: 0,
          avgPricePerGallon: 0, monthlySpent: 0, weeklyMiles: 0,
          weeklyTrips: 0, categoryCounts: {}, monthlyBudget: 0,
          favoriteCount: 0,
        })
      );
  }, []);

  if (!stats) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="skeleton h-8 w-48 rounded mb-2" />
          <div className="skeleton h-4 w-64 rounded" />
        </div>
        <SkeletonDashboard />
      </div>
    );
  }

  const budgetPercent =
    stats.monthlyBudget > 0
      ? Math.min((stats.monthlySpent / stats.monthlyBudget) * 100, 100)
      : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto page-enter">
      <div className="mb-8 animate-fade-in-up">
        <h1 className="text-3xl font-bold tracking-tight">{getGreeting()}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
          Your driving and gas expense overview
        </p>
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C8 2 4 6 4 10c0 5.4 7 11.5 7.3 11.8a1 1 0 001.4 0C13 21.5 20 15.4 20 10c0-4-4-8-8-8z"/><circle cx="12" cy="10" r="3"/></svg>}
          label="Total Trips"
          value={stats.totalTrips}
          sublabel={`${stats.weeklyTrips} this week`}
          delay={30}
        />
        <StatCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>}
          label="Miles Driven"
          value={stats.totalMiles}
          decimals={1}
          sublabel={`${stats.weeklyMiles} this week`}
          color="var(--md-tertiary-container)"
          delay={60}
        />
        <StatCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 22V6a2 2 0 012-2h8a2 2 0 012 2v16"/><path d="M7 10h4"/></svg>}
          label="Gas Used"
          value={stats.totalGallons}
          suffix=" gal"
          decimals={1}
          sublabel={`${stats.avgMpg} avg MPG`}
          delay={90}
        />
        <StatCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
          label="Total Spent"
          value={stats.totalSpent}
          prefix="$"
          decimals={2}
          sublabel={`$${stats.costPerMile}/mi`}
          color="var(--md-secondary-container)"
          delay={120}
        />
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Avg Gas Price", value: `$${stats.avgPricePerGallon.toFixed(2)}/gal` },
          { label: "This Month", value: `$${stats.monthlySpent.toFixed(2)}` },
          { label: "Favorites", value: `${stats.favoriteCount} trips` },
        ].map((item, i) => (
          <div
            key={item.label}
            className="md-card !p-3 animate-fade-in-up"
            style={{ animationDelay: `${150 + i * 30}ms` }}
          >
            <p className="text-xs font-medium" style={{ color: "var(--md-on-surface-variant)" }}>
              {item.label}
            </p>
            <p className="text-lg font-semibold tracking-tight mt-0.5">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Spending Breakdown */}
        <div className="md-card animate-fade-in-up" style={{ animationDelay: "180ms" }}>
          <h3 className="text-sm font-medium mb-4" style={{ color: "var(--md-on-surface-variant)" }}>
            Gas Spending Breakdown
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-sm font-medium">Paid by Me</span>
                <span className="text-sm font-semibold">${stats.selfPaid.toFixed(2)}</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--md-surface-container-high)" }}>
                <div
                  className="h-full rounded-full animate-progress"
                  style={{
                    width: `${stats.totalSpent > 0 ? (stats.selfPaid / stats.totalSpent) * 100 : 0}%`,
                    background: "var(--md-primary)",
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-sm font-medium">Paid by Parents</span>
                <span className="text-sm font-semibold">${stats.parentsPaid.toFixed(2)}</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--md-surface-container-high)" }}>
                <div
                  className="h-full rounded-full animate-progress"
                  style={{
                    width: `${stats.totalSpent > 0 ? (stats.parentsPaid / stats.totalSpent) * 100 : 0}%`,
                    background: "var(--md-tertiary)",
                    animationDelay: "0.1s",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Monthly Budget */}
          {stats.monthlyBudget > 0 && (
            <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--md-outline-variant)" }}>
              <div className="flex justify-between mb-1.5">
                <span className="text-sm font-medium">Monthly Budget</span>
                <span className="text-sm font-semibold">
                  ${stats.monthlySpent.toFixed(2)} / ${stats.monthlyBudget.toFixed(2)}
                </span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--md-surface-container-high)" }}>
                <div
                  className="h-full rounded-full animate-progress"
                  style={{
                    width: `${budgetPercent}%`,
                    background: budgetPercent > 90 ? "var(--md-error)" : budgetPercent > 70 ? "var(--md-warning)" : "var(--md-success)",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="md-card flex flex-col animate-fade-in-up" style={{ animationDelay: "210ms" }}>
          <h3 className="text-sm font-medium mb-4" style={{ color: "var(--md-on-surface-variant)" }}>
            Quick Actions
          </h3>
          <div className="space-y-3 flex-1 flex flex-col justify-center">
            <Link href="/trips/new" className="md-filled-button w-full">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Log New Trip
            </Link>
            <Link href="/gas/new" className="md-outlined-button w-full">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Gas Entry
            </Link>
            <Link href="/map" className="md-outlined-button w-full">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"/></svg>
              View Map
            </Link>
            <a href="/api/export" download className="md-tonal-button w-full justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </a>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      {Object.keys(stats.categoryCounts).length > 0 && (
        <div className="md-card animate-fade-in-up" style={{ animationDelay: "240ms" }}>
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--md-on-surface-variant)" }}>
            Trip Categories
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.categoryCounts).map(([cat, count]) => (
              <div key={cat} className="md-chip active">
                {CATEGORY_LABELS[cat] || cat}
                <span
                  className="ml-1 text-xs font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: "var(--md-primary-container)", color: "var(--md-on-primary-container)" }}
                >
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
