"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

interface GasEntry {
  id: string;
  date: string;
  gallons: number;
  pricePerGallon: number;
  totalCost: number;
  paidBy: string;
  fuelType: string;
  stationName: string | null;
}
interface Trip {
  id: string;
  date: string;
  startAddress: string;
  endAddress: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distance: number;
  duration: number;
  notes: string | null;
  category: string;
  isFavorite: boolean;
  paidBy: string;
  gasEntries: GasEntry[];
}

const CATEGORY_LABELS: Record<string, string> = {
  COMMUTE: "Commute", ERRAND: "Errand", ROAD_TRIP: "Road Trip",
  SCHOOL: "School", WORK: "Work", LEISURE: "Leisure", OTHER: "Other",
};

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch(`/api/trips/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setTrip)
      .catch(() => setNotFound(true));
  }, [id]);

  async function toggleFavorite() {
    if (!trip) return;
    const next = !trip.isFavorite;
    setTrip({ ...trip, isFavorite: next });
    await fetch("/api/trips", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: trip.id, isFavorite: next }),
    });
    toast(next ? "Added to favorites" : "Removed from favorites");
  }

  async function deleteTrip() {
    if (!trip) return;
    await fetch("/api/trips", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: trip.id }),
    });
    toast("Trip deleted", "info");
    window.location.assign("/trips");
  }

  function formatDuration(minutes: number) {
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  if (notFound) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/trips" className="text-sm" style={{ color: "var(--md-primary)" }}>← Back to trips</Link>
        <div className="md-card text-center py-16 mt-4">
          <p className="font-medium">Trip not found</p>
        </div>
      </div>
    );
  }
  if (!trip) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="skeleton h-6 w-32 rounded mb-4" />
        <div className="skeleton h-64 w-full rounded-2xl mb-4" />
        <div className="skeleton h-32 w-full rounded-2xl" />
      </div>
    );
  }

  const gasTotal = trip.gasEntries.reduce((s, g) => s + g.totalCost, 0);
  const avgSpeed = trip.duration > 0 ? (trip.distance / (trip.duration / 60)) : 0;

  return (
    <div className="p-6 max-w-3xl mx-auto page-enter">
      <div className="flex items-center justify-between mb-4 animate-fade-in-up">
        <Link href="/trips" className="text-sm inline-flex items-center gap-1" style={{ color: "var(--md-primary)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to trips
        </Link>
        <div className="flex items-center gap-1">
          <button onClick={toggleFavorite} className="md-icon-button" title={trip.isFavorite ? "Remove favorite" : "Add favorite"}>
            {trip.isFavorite ? "★" : "☆"}
          </button>
          <button onClick={() => setConfirmDelete(true)} className="md-icon-button" style={{ color: "var(--md-error)" }} title="Delete trip">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap animate-fade-in-up">
        <span className="md-badge" style={{ background: "var(--md-primary-container)", color: "var(--md-on-primary-container)" }}>
          {format(new Date(trip.date), "EEEE, MMM d, yyyy · h:mm a")}
        </span>
        <span className="md-badge" style={{ background: "var(--md-tertiary-container)", color: "var(--md-on-surface)" }}>
          {CATEGORY_LABELS[trip.category] || trip.category}
        </span>
        <span className="md-badge" style={{ background: trip.paidBy === "PARENTS" ? "var(--md-tertiary-container)" : "var(--md-primary-container)", color: "var(--md-on-surface)" }}>
          {trip.paidBy === "PARENTS" ? "Parents pay" : "I pay"}
        </span>
      </div>

      {/* Map */}
      <div className="rounded-2xl overflow-hidden mb-4 animate-fade-in-up" style={{ height: 280 }}>
        <MapView interactive={false} routes={[{
          id: trip.id, startLat: trip.startLat, startLng: trip.startLng,
          endLat: trip.endLat, endLng: trip.endLng,
          startAddress: trip.startAddress, endAddress: trip.endAddress,
        }]} />
      </div>

      {/* Route */}
      <div className="md-card mb-4 animate-fade-in-up">
        <p className="font-medium">{trip.startAddress}</p>
        <p className="text-sm flex items-center gap-1.5 mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          {trip.endAddress}
        </p>
        {trip.notes && <p className="text-sm mt-3 italic" style={{ color: "var(--md-on-surface-variant)" }}>{trip.notes}</p>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Distance", value: `${trip.distance} mi` },
          { label: "Duration", value: formatDuration(trip.duration) },
          { label: "Avg Speed", value: `${avgSpeed.toFixed(0)} mph` },
        ].map((s, i) => (
          <div key={s.label} className="md-card !p-3 animate-fade-in-up" style={{ animationDelay: `${i * 30}ms` }}>
            <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>{s.label}</p>
            <p className="text-lg font-semibold mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Gas entries linked to this trip */}
      {trip.gasEntries.length > 0 && (
        <div className="md-card animate-fade-in-up">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium" style={{ color: "var(--md-on-surface-variant)" }}>Fuel for this trip</h3>
            <span className="text-sm font-semibold">${gasTotal.toFixed(2)}</span>
          </div>
          <div className="space-y-2">
            {trip.gasEntries.map((g) => (
              <div key={g.id} className="flex items-center justify-between text-sm">
                <span>{g.gallons} gal · {g.stationName || "Fuel"}</span>
                <span className="flex items-center gap-2">
                  <span className="md-badge" style={{ background: g.paidBy === "PARENTS" ? "var(--md-tertiary-container)" : "var(--md-primary-container)", color: "var(--md-on-surface)" }}>
                    {g.paidBy === "PARENTS" ? "Parents" : "Me"}
                  </span>
                  ${g.totalCost.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Trip"
        message="This will permanently delete this trip and cannot be undone."
        onConfirm={deleteTrip}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
