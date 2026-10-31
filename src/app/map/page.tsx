"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { formatDistance, useDistanceUnit } from "@/lib/useDistanceUnit";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

interface Trip {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startAddress: string;
  endAddress: string;
  distance: number;
  category: string;
  routeEncoded?: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  COMMUTE: "Commute", ERRAND: "Errand", ROAD_TRIP: "Road Trip",
  SCHOOL: "School", WORK: "Work", LEISURE: "Leisure", OTHER: "Other",
};

export default function MapPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const distanceUnit = useDistanceUnit();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/trips?includeRoute=true", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Could not load trips");
        return r.json();
      })
      .then((data) => { setTrips(data); setLoadError(""); setLoading(false); })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError("Trips couldn’t be loaded. Check your connection and try again.");
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const filtered = categoryFilter
    ? trips.filter((t) => t.category === categoryFilter)
    : trips;

  const totalDistance = filtered.reduce((s, t) => s + t.distance, 0);

  const categories = [...new Set(trips.map((t) => t.category))];

  return (
    <div className="p-6 max-w-5xl mx-auto page-enter">
      <div className="mb-4 animate-fade-in-up">
        <h1 className="text-2xl font-bold tracking-tight">Trip Map</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--md-on-surface-variant)" }}>
          {filtered.length} trip{filtered.length !== 1 ? "s" : ""} · {formatDistance(totalDistance, distanceUnit)} total
        </p>
      </div>

      {categories.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-4 animate-fade-in-up stagger-2">
          <button
            onClick={() => setCategoryFilter("")}
            className={`md-chip ${!categoryFilter ? "active" : ""}`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`md-chip ${categoryFilter === cat ? "active" : ""}`}
            >
              {CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-[500px] animate-fade-in">
          <div className="text-center">
            <div
              className="w-10 h-10 border-3 rounded-full mx-auto mb-3"
              style={{
                borderColor: "var(--md-outline-variant)",
                borderTopColor: "var(--md-primary)",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>Loading map...</p>
          </div>
        </div>
      ) : loadError ? (
        <div className="md-card" role="alert">{loadError}</div>
      ) : (
        <div className="h-[calc(100vh-220px)] min-h-[400px] rounded-2xl overflow-hidden md-elevation-2 animate-scale-in">
          <MapView routes={filtered} interactive={false} />
        </div>
      )}
    </div>
  );
}
