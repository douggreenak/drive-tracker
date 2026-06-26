"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SkeletonRow } from "@/components/Skeleton";

interface Trip {
  id: string;
  date: string;
  startAddress: string;
  endAddress: string;
  distance: number;
  duration: number;
  notes: string | null;
  category: string;
  isFavorite: boolean;
  gasEntries: Array<{ totalCost: number; paidBy: string }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  COMMUTE: "Commute", ERRAND: "Errand", ROAD_TRIP: "Road Trip",
  SCHOOL: "School", WORK: "Work", LEISURE: "Leisure", OTHER: "Other",
};

const SORT_OPTIONS = [
  { value: "date", label: "Date" },
  { value: "distance", label: "Distance" },
  { value: "duration", label: "Duration" },
];

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchTrips = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (sort !== "date") params.set("sort", sort);
    if (categoryFilter) params.set("category", categoryFilter);
    if (favoritesOnly) params.set("favorites", "true");
    fetch(`/api/trips?${params}`)
      .then((r) => r.json())
      .then((data) => { setTrips(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search, sort, categoryFilter, favoritesOnly]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  async function toggleFavorite(id: string, current: boolean) {
    await fetch("/api/trips", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isFavorite: !current }),
    });
    setTrips((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isFavorite: !current } : t))
    );
    toast(!current ? "Added to favorites" : "Removed from favorites");
  }

  async function deleteTrip() {
    if (!deleteId) return;
    await fetch("/api/trips", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteId }),
    });
    setTrips((prev) => prev.filter((t) => t.id !== deleteId));
    setDeleteId(null);
    toast("Trip deleted", "info");
  }

  function formatDuration(minutes: number) {
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto page-enter">
      <div className="flex items-center justify-between mb-4 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trips</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--md-on-surface-variant)" }}>
            {trips.length} trip{trips.length !== 1 ? "s" : ""} logged
          </p>
        </div>
        <Link href="/trips/new" className="md-filled-button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Trip
        </Link>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-3 mb-6 animate-fade-in-up stagger-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--md-on-surface-variant)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trips..."
            className="md-text-field !pl-10 !py-3"
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex gap-1.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className={`md-chip ${sort === opt.value ? "active" : ""}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="w-px h-6 mx-1" style={{ background: "var(--md-outline-variant)" }} />
          <button
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={`md-chip ${favoritesOnly ? "active" : ""}`}
          >
            ★ Favorites
          </button>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="md-chip !border !cursor-pointer"
            style={{ background: categoryFilter ? "var(--md-secondary-container)" : undefined }}
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Trip List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <SkeletonRow key={i} />)}
        </div>
      ) : trips.length === 0 ? (
        <div className="md-card text-center py-16 animate-scale-in">
          <svg className="mx-auto mb-3" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--md-on-surface-variant)" strokeWidth="1.5" opacity="0.5">
            <path d="M12 2C8 2 4 6 4 10c0 5.4 7 11.5 7.3 11.8a1 1 0 001.4 0C13 21.5 20 15.4 20 10c0-4-4-8-8-8z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <p className="font-medium mb-1">No trips yet</p>
          <p className="text-sm mb-5" style={{ color: "var(--md-on-surface-variant)" }}>
            {search ? "Try a different search" : "Start tracking your drives"}
          </p>
          {!search && (
            <Link href="/trips/new" className="md-filled-button">Log Your First Trip</Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {trips.map((trip, i) => (
            <div
              key={trip.id}
              className="md-card animate-fade-in-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span
                      className="md-badge"
                      style={{ background: "var(--md-primary-container)", color: "var(--md-on-primary-container)" }}
                    >
                      {format(new Date(trip.date), "MMM d, yyyy")}
                    </span>
                    <span
                      className="md-badge"
                      style={{ background: "var(--md-tertiary-container)", color: "var(--md-on-surface)" }}
                    >
                      {CATEGORY_LABELS[trip.category] || trip.category}
                    </span>
                    <span className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
                      {trip.distance} mi · {formatDuration(trip.duration)}
                    </span>
                  </div>
                  <p className="font-medium truncate">{trip.startAddress}</p>
                  <p className="text-sm flex items-center gap-1.5" style={{ color: "var(--md-on-surface-variant)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    {trip.endAddress}
                  </p>
                  {trip.notes && (
                    <p className="text-xs mt-1.5 italic" style={{ color: "var(--md-on-surface-variant)" }}>
                      {trip.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleFavorite(trip.id, trip.isFavorite)}
                    className="md-icon-button"
                    title={trip.isFavorite ? "Remove favorite" : "Add favorite"}
                  >
                    {trip.isFavorite ? "★" : "☆"}
                  </button>
                  <button
                    onClick={() => setDeleteId(trip.id)}
                    className="md-icon-button"
                    style={{ color: "var(--md-error)" }}
                    title="Delete trip"
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
        title="Delete Trip"
        message="This will permanently delete this trip and cannot be undone."
        onConfirm={deleteTrip}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
