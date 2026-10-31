"use client";

import { useEffect, useMemo, useRef, useState, use } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { convertSpeed, formatDistance, useDistanceUnit } from "@/lib/useDistanceUnit";

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
  movingSeconds: number | null;
  avgSpeed: number | null;
  notes: string | null;
  category: string;
  isFavorite: boolean;
  paidBy: string;
  routeEncoded: string | null;
  stops: Array<{ address?: string; lat: number; lng: number }> | null;
  gasEntries: GasEntry[];
}

interface TrackPoint {
  seq: number;
  t: string;
  lat: number;
  lng: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  COMMUTE: "Commute", ERRAND: "Errand", ROAD_TRIP: "Road Trip",
  SCHOOL: "School", WORK: "Work", LEISURE: "Leisure", OTHER: "Other",
};

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TripDetail key={id} tripId={id} />;
}

function TripDetail({ tripId: id }: { tripId: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[] | null>(null);
  const [trackError, setTrackError] = useState("");
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackProgressRef = useRef(0);
  const { toast } = useToast();
  const distanceUnit = useDistanceUnit();

  useEffect(() => {
    fetch(`/api/trips/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setTrip)
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/trips/${id}/points`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load GPS track");
        return response.json();
      })
      .then((data: TrackPoint[]) => {
        setTrackPoints(data.filter((point) =>
          Number.isFinite(point.lat) && Number.isFinite(point.lng)
          && point.lat >= -90 && point.lat <= 90
          && point.lng >= -180 && point.lng <= 180
        ));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTrackError("The recorded route couldn’t be loaded.");
        setTrackPoints([]);
      });
    return () => controller.abort();
  }, [id]);

  const trackPointCount = trackPoints?.length ?? 0;
  useEffect(() => {
    if (!isPlaying || trackPointCount < 2 || playbackProgressRef.current >= 1) return;
    const interval = window.setInterval(() => {
      const progress = Math.min(playbackProgressRef.current + playbackSpeed / 240, 1);
      playbackProgressRef.current = progress;
      setPlaybackProgress(progress);
      if (progress >= 1) setIsPlaying(false);
    }, 250);
    return () => window.clearInterval(interval);
  }, [isPlaying, trackPointCount, playbackSpeed]);

  async function toggleFavorite() {
    if (!trip) return;
    const next = !trip.isFavorite;
    try {
      const response = await fetch("/api/trips", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trip.id, isFavorite: next }),
      });
      if (!response.ok) throw new Error("Could not update favorite");
      setTrip({ ...trip, isFavorite: next });
      toast(next ? "Added to favorites" : "Removed from favorites");
    } catch {
      toast("Could not update favorite", "error");
    }
  }

  async function togglePaidBy() {
    if (!trip) return;
    const next = trip.paidBy === "PARENTS" ? "SELF" : "PARENTS";
    try {
      const response = await fetch("/api/trips", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trip.id, paidBy: next }),
      });
      if (!response.ok) throw new Error("Could not update payer");
      setTrip({ ...trip, paidBy: next });
      toast(next === "PARENTS" ? "Parents pay for this drive" : "You pay for this drive");
    } catch {
      toast("Could not update payer", "error");
    }
  }

  async function updateField(patch: Record<string, unknown>) {
    if (!trip) return;
    try {
      const response = await fetch("/api/trips", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trip.id, ...patch }),
      });
      if (!response.ok) throw new Error("Could not update trip");
      setTrip({ ...trip, ...patch } as Trip);
      toast("Saved");
    } catch {
      toast("Could not save trip changes", "error");
    }
  }

  async function deleteTrip() {
    if (!trip) return;
    try {
      const response = await fetch("/api/trips", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trip.id }),
      });
      if (!response.ok) throw new Error("Could not delete trip");
      toast("Trip deleted", "info");
      window.location.assign("/trips");
    } catch {
      toast("Could not delete trip", "error");
    }
  }

  function formatDuration(minutes: number) {
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  const playbackCoordinates = useMemo(
    () => trackPoints?.map((point) => [point.lat, point.lng] as [number, number]) ?? [],
    [trackPoints],
  );

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
  const avgSpeedMph = trip.avgSpeed
    ?? (trip.movingSeconds && trip.movingSeconds > 0
      ? trip.distance / (trip.movingSeconds / 3600)
      : trip.duration > 0 ? trip.distance / (trip.duration / 60) : 0);
  const avgSpeed = convertSpeed(avgSpeedMph, distanceUnit);
  const currentTrackIndex = trackPoints?.length
    ? Math.min(Math.floor(playbackProgress * (trackPoints.length - 1)), trackPoints.length - 1)
    : 0;
  const currentTrackPoint = trackPoints?.[currentTrackIndex];
  const trackPlayback = trackPoints && trackPoints.length > 1
    ? {
      points: playbackCoordinates,
      index: currentTrackIndex,
    }
    : null;

  function setPlaybackPosition(value: number) {
    setIsPlaying(false);
    const progress = value / 1000;
    playbackProgressRef.current = progress;
    setPlaybackProgress(progress);
  }

  function togglePlayback() {
    if (!trackPoints || trackPoints.length < 2) return;
    if (playbackProgress >= 1) {
      playbackProgressRef.current = 0;
      setPlaybackProgress(0);
    }
    setIsPlaying((playing) => !playing);
  }

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
        <select
          value={trip.category}
          onChange={(e) => updateField({ category: e.target.value })}
          className="md-badge !border !cursor-pointer"
          style={{ background: "var(--md-tertiary-container)", color: "var(--md-on-surface)" }}
          title="Change category"
        >
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button
          onClick={togglePaidBy}
          className="md-badge !cursor-pointer"
          style={{ background: trip.paidBy === "PARENTS" ? "var(--md-tertiary-container)" : "var(--md-primary-container)", color: "var(--md-on-surface)" }}
          title="Tap to change who pays"
        >
          {trip.paidBy === "PARENTS" ? "Parents pay" : "I pay"} ⇄
        </button>
      </div>

      {/* Map */}
      <div className="rounded-2xl overflow-hidden mb-4 animate-fade-in-up" style={{ height: 280 }}>
        <MapView interactive={false} routes={[{
          id: trip.id, startLat: trip.startLat, startLng: trip.startLng,
          endLat: trip.endLat, endLng: trip.endLng,
          startAddress: trip.startAddress, endAddress: trip.endAddress,
          routeEncoded: trip.routeEncoded, stops: trip.stops,
        }]} trackPlayback={trackPlayback} />
      </div>

      <section className="md-card mb-4" aria-label="Trip playback">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="font-semibold">Trip playback</h2>
            <p className="text-xs mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
              {trackPoints === null ? "Loading recorded route…" : trackPoints.length > 1
                ? `${trackPoints.length.toLocaleString()} GPS points · full trip in about ${60 / playbackSpeed} seconds`
                : "No GPS recording is available for this trip."}
            </p>
          </div>
          {trackPoints && trackPoints.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="md-filled-button"
                onClick={togglePlayback}
                aria-label={isPlaying ? "Pause trip playback" : playbackProgress >= 1 ? "Replay trip" : "Play trip"}
              >
                {isPlaying ? "Pause" : playbackProgress >= 1 ? "Replay" : "Play"}
              </button>
              <label className="text-xs font-medium flex items-center gap-2" style={{ color: "var(--md-on-surface-variant)" }}>
                Speed
                <select
                  className="md-chip !cursor-pointer"
                  value={playbackSpeed}
                  onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
                  aria-label="Playback speed"
                >
                  {[1, 2, 4].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
                </select>
              </label>
            </div>
          )}
        </div>
        {trackError && <p role="alert" className="text-sm mb-3" style={{ color: "var(--md-error)" }}>{trackError}</p>}
        {trackPoints && trackPoints.length > 1 && currentTrackPoint && (
          <>
            <input
              type="range"
              min="0"
              max="1000"
              step="1"
              value={Math.round(playbackProgress * 1000)}
              onChange={(event) => setPlaybackPosition(Number(event.target.value))}
              className="w-full accent-[var(--md-primary)]"
              aria-label="Seek through recorded trip"
              aria-valuetext={`${Math.round(playbackProgress * 100)} percent`}
            />
            <div className="flex justify-between gap-3 text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
              <span>{format(new Date(trackPoints[0].t), "h:mm:ss a")}</span>
              <span>Point {currentTrackIndex + 1} of {trackPoints.length.toLocaleString()} · {format(new Date(currentTrackPoint.t), "h:mm:ss a")}</span>
              <span>{format(new Date(trackPoints[trackPoints.length - 1].t), "h:mm:ss a")}</span>
            </div>
          </>
        )}
      </section>

      {/* Route */}
      <div className="md-card mb-4 animate-fade-in-up">
        <p className="font-medium">{trip.startAddress}</p>
        {(trip.stops ?? []).map((stop, i) => (
          <p key={i} className="text-sm flex items-center gap-1.5 mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
            <span className="inline-flex items-center justify-center rounded-full text-white text-[10px] font-bold" style={{ width: 16, height: 16, background: "#e8a33d" }}>{i + 1}</span>
            {stop.address || `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`}
          </p>
        ))}
        <p className="text-sm flex items-center gap-1.5 mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          {trip.endAddress}
        </p>
        <textarea
          defaultValue={trip.notes ?? ""}
          placeholder="Add notes…"
          onBlur={(e) => { if (e.target.value !== (trip.notes ?? "")) updateField({ notes: e.target.value || null }); }}
          className="md-text-field mt-3 w-full text-sm"
          rows={2}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Distance", value: formatDistance(trip.distance, distanceUnit) },
          { label: "Duration", value: formatDuration(trip.duration) },
          { label: "Avg Speed", value: `${avgSpeed.toFixed(0)} ${distanceUnit === "km" ? "km/h" : "mph"}` },
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
