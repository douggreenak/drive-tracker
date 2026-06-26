"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SkeletonRow } from "@/components/Skeleton";

interface GasEntry {
  id: string;
  date: string;
  gallons: number;
  pricePerGallon: number;
  totalCost: number;
  paidBy: "SELF" | "PARENTS";
  fuelType: string;
  stationName: string | null;
  odometer: number | null;
  trip: { startAddress: string; endAddress: string } | null;
}

const FUEL_LABELS: Record<string, string> = {
  REGULAR: "Regular", MIDGRADE: "Midgrade", PREMIUM: "Premium", DIESEL: "Diesel",
};

export default function GasPage() {
  const [entries, setEntries] = useState<GasEntry[]>([]);
  const [filter, setFilter] = useState<"ALL" | "SELF" | "PARENTS">("ALL");
  const [sort, setSort] = useState("date");
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchEntries = useCallback(() => {
    const params = new URLSearchParams();
    if (filter !== "ALL") params.set("paidBy", filter);
    if (sort !== "date") params.set("sort", sort);
    fetch(`/api/gas?${params}`)
      .then((r) => r.json())
      .then((data) => { setEntries(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter, sort]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  async function deleteEntry() {
    if (!deleteId) return;
    await fetch("/api/gas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteId }),
    });
    setEntries((prev) => prev.filter((e) => e.id !== deleteId));
    setDeleteId(null);
    toast("Gas entry deleted", "info");
  }

  const totalFiltered = entries.reduce((s, e) => s + e.totalCost, 0);
  const totalGallons = entries.reduce((s, e) => s + e.gallons, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto page-enter">
      <div className="flex items-center justify-between mb-4 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gas Log</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--md-on-surface-variant)" }}>
            ${totalFiltered.toFixed(2)} · {totalGallons.toFixed(1)} gal
          </p>
        </div>
        <Link href="/gas/new" className="md-filled-button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Gas
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center mb-6 animate-fade-in-up stagger-2">
        {(["ALL", "SELF", "PARENTS"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`md-chip ${filter === f ? "active" : ""}`}
          >
            {f === "ALL" ? "All" : f === "SELF" ? "Paid by Me" : "Paid by Parents"}
          </button>
        ))}
        <div className="w-px h-6 mx-1" style={{ background: "var(--md-outline-variant)" }} />
        {[
          { value: "date", label: "Newest" },
          { value: "cost", label: "Highest $" },
          { value: "gallons", label: "Most Gas" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSort(opt.value)}
            className={`md-chip ${sort === opt.value ? "active" : ""}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <SkeletonRow key={i} />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="md-card text-center py-16 animate-scale-in">
          <svg className="mx-auto mb-3" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--md-on-surface-variant)" strokeWidth="1.5" opacity="0.5">
            <path d="M3 22V6a2 2 0 012-2h8a2 2 0 012 2v16"/><path d="M7 10h4"/>
          </svg>
          <p className="font-medium mb-1">No gas entries yet</p>
          <p className="text-sm mb-5" style={{ color: "var(--md-on-surface-variant)" }}>
            Start tracking your fuel expenses
          </p>
          <Link href="/gas/new" className="md-filled-button">Add First Entry</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <div
              key={entry.id}
              className="md-card animate-fade-in-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span
                      className="md-badge"
                      style={
                        entry.paidBy === "SELF"
                          ? { background: "var(--md-primary-container)", color: "var(--md-on-primary-container)" }
                          : { background: "var(--md-tertiary-container)", color: "var(--md-on-surface)" }
                      }
                    >
                      {entry.paidBy === "SELF" ? "Me" : "Parents"}
                    </span>
                    <span
                      className="md-badge"
                      style={{ background: "var(--md-surface-container-high)", color: "var(--md-on-surface-variant)" }}
                    >
                      {FUEL_LABELS[entry.fuelType] || entry.fuelType}
                    </span>
                    <span className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
                      {format(new Date(entry.date), "MMM d, yyyy")}
                    </span>
                  </div>
                  <p className="font-medium">
                    {entry.gallons.toFixed(1)} gal @ ${entry.pricePerGallon.toFixed(2)}/gal
                  </p>
                  {entry.stationName && (
                    <p className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
                      {entry.stationName}
                    </p>
                  )}
                  {entry.odometer && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--md-on-surface-variant)" }}>
                      Odometer: {entry.odometer.toLocaleString()} mi
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-lg font-semibold">${entry.totalCost.toFixed(2)}</span>
                  <button
                    onClick={() => setDeleteId(entry.id)}
                    className="md-icon-button"
                    style={{ color: "var(--md-error)" }}
                    title="Delete"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Gas Entry"
        message="This will permanently delete this gas entry."
        onConfirm={deleteEntry}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
