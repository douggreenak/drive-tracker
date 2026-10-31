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
  endDate: string | null;
  name: string | null;
  startAddress: string;
  endAddress: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distance: number;
  duration: number;
  movingSeconds: number | null;
  maxSpeed: number | null;
  avgSpeed: number | null;
  notes: string | null;
  category: string;
  isFavorite: boolean;
  paidBy: string;
  vehicleName: string | null;
  vehicleMpg: number | null;
  estimatedGallons: number | null;
  scheduledDeparture: string | null;
  scheduledArrival: string | null;
  matchedPolyline: string | null;
  matchedFraction: number | null;
  usedRouteMatching: boolean;
  journeyId: string | null;
  legIndex: number;
  legTotal: number;
  isManualEntry: boolean;
  routeEncoded: string | null;
  stops: Array<{ address?: string; lat: number; lng: number }> | null;
  journeyLegs: Array<{
    id: string;
    legIndex: number;
    legTotal: number;
    startAddress: string;
    endAddress: string;
    distance: number;
    duration: number;
  }>;
  gasEntries: GasEntry[];
}

interface TrackPoint {
  seq: number;
  t: string;
  lat: number;
  lng: number;
  speed: number;
  onRoad: boolean;
}

interface FuelBand {
  label: string;
  miles: number;
  gallons: number;
}

function estimateFuelBands(points: TrackPoint[], distance: number, avgSpeedMph: number, ratedMpg: number): FuelBand[] {
  const anchors: Array<[number, number]> = [
    [0, 0.30], [10, 0.55], [20, 0.74], [30, 0.87], [40, 0.96],
    [50, 1], [55, 1], [60, 0.95], [65, 0.89], [70, 0.82],
    [80, 0.70], [90, 0.58], [100, 0.48],
  ];
  const efficiencyAt = (speed: number) => {
    const mph = Math.max(0, speed);
    let peak = anchors[anchors.length - 1][1];
    if (mph <= anchors[0][0]) {
      peak = anchors[0][1];
    } else {
      for (let index = 1; index < anchors.length; index += 1) {
        const [upperSpeed, upperEfficiency] = anchors[index];
        if (mph <= upperSpeed) {
          const [lowerSpeed, lowerEfficiency] = anchors[index - 1];
          const ratio = (mph - lowerSpeed) / (upperSpeed - lowerSpeed);
          peak = lowerEfficiency + ratio * (upperEfficiency - lowerEfficiency);
          break;
        }
      }
    }
    return peak / 0.915;
  };
  const segments: Array<{ miles: number; mph: number }> = [];
  if (points.length > 1) {
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const meters = distanceMeters(previous.lat, previous.lng, current.lat, current.lng);
      if (meters >= 500) continue;
      const miles = meters / 1609.34;
      if (miles <= 0) continue;
      let speed = Number.isFinite(previous.speed) && Number.isFinite(current.speed)
        ? (previous.speed + current.speed) / 2
        : 0;
      if (speed <= 0) {
        const seconds = (new Date(current.t).getTime() - new Date(previous.t).getTime()) / 1000;
        if (seconds > 0.5) speed = miles / (seconds / 3600);
      }
      segments.push({ miles, mph: Math.max(0, speed) });
    }
  } else if (distance > 0) {
    segments.push({ miles: distance, mph: avgSpeedMph });
  }

  const bands: Array<{ label: string; min: number; max: number }> = [
    { label: "0–25 mph", min: 0, max: 25 },
    { label: "25–45 mph", min: 25, max: 45 },
    { label: "45–65 mph", min: 45, max: 65 },
    { label: "65+ mph", min: 65, max: Infinity },
  ];
  return bands.map((band) => {
    const matching = segments.filter((segment) => segment.mph >= band.min && segment.mph < band.max);
    return {
      label: band.label,
      miles: matching.reduce((sum, segment) => sum + segment.miles, 0),
      gallons: matching.reduce((sum, segment) => {
        const mpg = Math.max(1, ratedMpg * efficiencyAt(segment.mph));
        return sum + segment.miles / mpg;
      }, 0),
    };
  }).filter((band) => band.miles > 0.01);
}

interface SavedPlace {
  label: string;
  lat: number;
  lng: number;
}

interface PayerGroup {
  key: string;
  name: string;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [payerGroups, setPayerGroups] = useState<PayerGroup[]>([]);
  const [metadataError, setMetadataError] = useState("");
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

  useEffect(() => {
    Promise.all([
      fetch("/api/saved-places").then((response) => {
        if (!response.ok) throw new Error("Could not load saved places");
        return response.json();
      }),
      fetch("/api/payer-groups").then((response) => {
        if (!response.ok) throw new Error("Could not load payer groups");
        return response.json();
      }),
    ]).then(([places, groups]) => {
      setSavedPlaces(Array.isArray(places) ? places : []);
      setPayerGroups(Array.isArray(groups) ? groups : []);
    }).catch(() => {
      setSavedPlaces([]);
      setPayerGroups([]);
      setMetadataError("Saved place and payer labels are unavailable; showing stored trip details.");
    });
  }, []);

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
  const mapRoutes = useMemo(() => {
    if (!trip) return [];
    const savedLabel = (lat: number, lng: number, fallback: string) => {
      const closest = savedPlaces
        .map((place) => ({ place, distance: distanceMeters(lat, lng, place.lat, place.lng) }))
        .filter(({ distance }) => distance <= 160)
        .sort((a, b) => a.distance - b.distance)[0];
      return closest?.place.label || fallback;
    };
    return [{
      id: trip.id,
      startLat: trip.startLat,
      startLng: trip.startLng,
      endLat: trip.endLat,
      endLng: trip.endLng,
      startAddress: savedLabel(trip.startLat, trip.startLng, trip.startAddress),
      endAddress: savedLabel(trip.endLat, trip.endLng, trip.endAddress),
      routeEncoded: trip.routeEncoded,
      stops: (trip.stops ?? []).map((stop) => ({
        ...stop,
        address: savedLabel(stop.lat, stop.lng, stop.address || `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`),
      })),
      matchedPolyline: trip.usedRouteMatching ? trip.matchedPolyline : null,
      deviationPoints: trip.usedRouteMatching
        ? (trackPoints ?? []).filter((point) => !point.onRoad).map((point) => [point.lat, point.lng] as [number, number])
        : [],
    }];
  }, [trip, savedPlaces, trackPoints]);

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
  const maxSpeed = trip.maxSpeed != null ? convertSpeed(trip.maxSpeed, distanceUnit) : null;
  const mpg = trip.vehicleMpg && trip.vehicleMpg > 0 ? trip.vehicleMpg : 25;
  const fuelBands = estimateFuelBands(trackPoints ?? [], trip.distance, avgSpeedMph, mpg);
  const calculatedFuelGallons = fuelBands.reduce((sum, band) => sum + band.gallons, 0);
  const estimatedGallons = trip.estimatedGallons != null
    ? trip.estimatedGallons
    : calculatedFuelGallons;
  const flatAverageGallons = trip.distance / mpg;
  const actualDeparture = new Date(trip.date);
  const actualArrival = trip.endDate
    ? new Date(trip.endDate)
    : new Date(actualDeparture.getTime() + trip.duration * 60_000);
  const arrivalDeltaSeconds = trip.scheduledArrival
    ? Math.round((actualArrival.getTime() - new Date(trip.scheduledArrival).getTime()) / 1000)
    : null;
  const departureDeltaSeconds = trip.scheduledDeparture
    ? Math.round((actualDeparture.getTime() - new Date(trip.scheduledDeparture).getTime()) / 1000)
    : null;
  const arrivalStatus = arrivalDeltaSeconds === null
    ? "Unscheduled"
    : Math.abs(arrivalDeltaSeconds) < 90
      ? "On time"
      : arrivalDeltaSeconds > 0
        ? `${Math.max(1, Math.round(arrivalDeltaSeconds / 60))}m delayed`
        : `${Math.max(1, Math.round(Math.abs(arrivalDeltaSeconds) / 60))}m early`;
  const arrivalStatusColor = arrivalDeltaSeconds === null
    ? "var(--md-on-surface-variant)"
    : Math.abs(arrivalDeltaSeconds) < 90
      ? "var(--md-primary)"
      : arrivalDeltaSeconds > 0 ? "var(--md-error)" : "var(--md-tertiary)";
  const payerName = payerGroups.find((group) => group.key === trip.paidBy)?.name
    ?? (trip.paidBy === "PARENTS" ? "Parents" : trip.paidBy === "SELF" ? "Me" : "Other");
  const payerLabel = (key: string) => payerGroups.find((group) => group.key === key)?.name
    ?? (key === "PARENTS" ? "Parents" : key === "SELF" ? "Me" : "Other");
  const placeLabel = (lat: number, lng: number, fallback: string) => {
    const closest = savedPlaces
      .map((place) => ({ place, distance: distanceMeters(lat, lng, place.lat, place.lng) }))
      .filter(({ distance }) => distance <= 160)
      .sort((a, b) => a.distance - b.distance)[0];
    return closest?.place.label || fallback;
  };
  const startLabel = placeLabel(trip.startLat, trip.startLng, trip.startAddress);
  const endLabel = placeLabel(trip.endLat, trip.endLng, trip.endAddress);
  const journeyDistance = trip.journeyLegs.reduce((sum, leg) => sum + leg.distance, 0);
  const journeyDuration = trip.journeyLegs.reduce((sum, leg) => sum + leg.duration, 0);
  const journeyHasMultipleLegs = trip.journeyLegs.length > 1;
  const speedValues = (trackPoints ?? [])
    .map((point) => Number.isFinite(point.speed) ? convertSpeed(point.speed, distanceUnit) : 0)
    .filter((speed) => speed > 0);
  const maxChartSpeed = Math.max(10, speedValues.reduce((maximum, speed) => Math.max(maximum, speed), 0));
  const chartTrackPoints = (trackPoints ?? []).filter((_, index, points) =>
    index % Math.max(1, Math.ceil(points.length / 600)) === 0 || index === points.length - 1
  );
  const speedChartPoints = chartTrackPoints
    .map((point, index, points) => {
      const speed = Number.isFinite(point.speed) ? convertSpeed(point.speed, distanceUnit) : 0;
      const x = points.length > 1 ? index / (points.length - 1) * 100 : 0;
      const y = 100 - speed / maxChartSpeed * 90;
      return `${x},${y}`;
    })
    .join(" ");
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

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap animate-fade-in-up">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold truncate">{trip.name || "Trip Detail"}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
            {format(actualDeparture, "EEEE, MMM d, yyyy · h:mm a")}
          </p>
        </div>
        <span className="md-badge" style={{ background: "var(--md-primary-container)", color: arrivalStatusColor }}>
          {arrivalStatus}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap animate-fade-in-up">
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
          {payerName} paid ⇄
        </button>
        {journeyHasMultipleLegs && <span className="md-badge">Leg {trip.legIndex + 1} of {trip.legTotal}</span>}
        {trip.isManualEntry && <span className="md-badge">Manual entry</span>}
      </div>

      {metadataError && <p className="text-xs mb-3" role="status" style={{ color: "var(--md-on-surface-variant)" }}>{metadataError}</p>}
      {trip.isManualEntry && (
        <div className="md-card mb-4 text-sm" style={{ borderColor: "var(--md-tertiary)" }}>
          <p className="font-medium">Not a recorded drive</p>
          <p className="mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
            Route, distance, and timing were entered or estimated; GPS playback and speed history are not available.
          </p>
        </div>
      )}

      {/* Map */}
      <div className="rounded-2xl overflow-hidden mb-4 animate-fade-in-up" style={{ height: 280 }}>
        <MapView interactive={false} routes={mapRoutes} trackPlayback={trackPlayback} />
      </div>

      <section className="md-card mb-4" aria-label="Trip timing">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
          <div>
            <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>Departed</p>
            <p className="font-semibold">{format(actualDeparture, "h:mm a")}</p>
            {trip.scheduledDeparture && (
              <p className="text-xs mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
                Scheduled {format(new Date(trip.scheduledDeparture), "h:mm a")}
                {departureDeltaSeconds !== null && Math.abs(departureDeltaSeconds) >= 60
                  ? ` · ${Math.round(Math.abs(departureDeltaSeconds) / 60)}m ${departureDeltaSeconds > 0 ? "late" : "early"}`
                  : departureDeltaSeconds !== null ? " · on time" : ""}
              </p>
            )}
          </div>
          <div className="sm:text-center">
            <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>Elapsed</p>
            <p className="font-semibold">{formatDuration(trip.duration)}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
              {trip.endDate ? "Arrived" : "Estimated arrival"}
            </p>
            <p className="font-semibold">{format(actualArrival, "h:mm a")}</p>
            {trip.scheduledArrival && (
              <p className="text-xs mt-1" style={{ color: arrivalStatusColor }}>
                Scheduled {format(new Date(trip.scheduledArrival), "h:mm a")} · {arrivalStatus}
              </p>
            )}
          </div>
        </div>
      </section>

      {!trip.isManualEntry && <section className="md-card mb-4" aria-label="Trip playback">
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
      </section>}

      {/* Route */}
      <div className="md-card mb-4 animate-fade-in-up">
        <p className="font-medium">{startLabel}</p>
        {(trip.stops ?? []).length === 0 && (
          <p className="text-sm mt-1" style={{ color: "var(--md-on-surface-variant)" }}>No stops recorded</p>
        )}
        {(trip.stops ?? []).map((stop, i) => (
          <p key={i} className="text-sm flex items-center gap-1.5 mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
            <span className="inline-flex items-center justify-center rounded-full text-white text-[10px] font-bold" style={{ width: 16, height: 16, background: "#e8a33d" }}>{i + 1}</span>
            {placeLabel(stop.lat, stop.lng, stop.address || `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`)}
          </p>
        ))}
        <p className="text-sm flex items-center gap-1.5 mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          {endLabel}
        </p>
        <textarea
          defaultValue={trip.notes ?? ""}
          placeholder="Add notes…"
          onBlur={(e) => { if (e.target.value !== (trip.notes ?? "")) updateField({ notes: e.target.value || null }); }}
          className="md-text-field mt-3 w-full text-sm"
          rows={2}
        />
      </div>

      {/* Trip statistics */}
      <div className={`grid grid-cols-2 ${!trip.isManualEntry && maxSpeed !== null ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-3 mb-4`}>
        {[
          { label: "Distance", value: formatDistance(trip.distance, distanceUnit) },
          { label: "Duration", value: formatDuration(trip.duration) },
          { label: "Avg Speed", value: `${avgSpeed.toFixed(0)} ${distanceUnit === "km" ? "km/h" : "mph"}` },
          ...(!trip.isManualEntry && maxSpeed !== null
            ? [{ label: "Top Speed", value: `${maxSpeed.toFixed(0)} ${distanceUnit === "km" ? "km/h" : "mph"}` }]
            : []),
        ].map((s, i) => (
          <div key={s.label} className="md-card !p-3 animate-fade-in-up" style={{ animationDelay: `${i * 30}ms` }}>
            <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>{s.label}</p>
            <p className="text-lg font-semibold mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {journeyHasMultipleLegs && (
        <section className="md-card mb-4" aria-label="Journey details">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold">Journey · {trip.legTotal} legs</h2>
              <p className="text-sm mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
                {formatDistance(journeyDistance, distanceUnit)} total · {formatDuration(journeyDuration)}
              </p>
            </div>
          </div>
          <ol className="space-y-2">
            {trip.journeyLegs.map((leg) => (
              <li key={leg.id} className="flex items-start gap-3 text-sm">
                <span className="md-badge shrink-0">{leg.legIndex + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{leg.startAddress} → {leg.endAddress}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--md-on-surface-variant)" }}>
                    {formatDistance(leg.distance, distanceUnit)} · {formatDuration(leg.duration)}
                    {leg.id === trip.id ? " · This leg" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {trip.usedRouteMatching && (
        <section className="md-card mb-4" aria-label="Route matching details">
          <h2 className="font-semibold">Recorded route quality</h2>
          <p className="text-sm mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
            {trip.matchedFraction != null
              ? `${Math.round(trip.matchedFraction <= 1 ? trip.matchedFraction * 100 : trip.matchedFraction)}% matched to known roads`
              : "Route matched to known roads"}
            {trackPoints?.some((point) => !point.onRoad) ? "; orange dots mark recorded detours." : "."}
          </p>
        </section>
      )}

      {!trip.isManualEntry && trackPoints && trackPoints.length > 1 && (
        <section className="md-card mb-4" aria-label="Speed history">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold">Speed history</h2>
              <p className="text-xs mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
                Recorded during the trip · {distanceUnit === "km" ? "km/h" : "mph"}
              </p>
            </div>
            {maxSpeed !== null && <span className="text-sm font-semibold">Peak {maxSpeed.toFixed(0)} {distanceUnit === "km" ? "km/h" : "mph"}</span>}
          </div>
          <svg
            viewBox="0 0 100 100"
            role="img"
            aria-label={`Recorded speed history from ${format(new Date(trackPoints[0].t), "h:mm a")} to ${format(new Date(trackPoints[trackPoints.length - 1].t), "h:mm a")}`}
            className="w-full h-36 overflow-visible"
            preserveAspectRatio="none"
          >
            <text x="1" y="12" fontSize="5" fill="var(--md-on-surface-variant)">{maxChartSpeed.toFixed(0)}</text>
            <text x="1" y="57" fontSize="5" fill="var(--md-on-surface-variant)">{(maxChartSpeed / 2).toFixed(0)}</text>
            <line x1="0" y1="10" x2="100" y2="10" stroke="var(--md-outline-variant)" strokeDasharray="1 2" />
            <line x1="0" y1="55" x2="100" y2="55" stroke="var(--md-outline-variant)" strokeDasharray="1 2" />
            <line x1="0" y1="99" x2="100" y2="99" stroke="var(--md-outline-variant)" />
            {speedChartPoints && <polyline points={speedChartPoints} fill="none" stroke="var(--md-primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
          </svg>
          <div className="flex justify-between text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
            <span>{format(new Date(trackPoints[0].t), "h:mm a")}</span>
            <span>{format(new Date(trackPoints[trackPoints.length - 1].t), "h:mm a")}</span>
          </div>
        </section>
      )}

      <section className="md-card mb-4" aria-label="Fuel estimate">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Estimated fuel use</h2>
            <p className="text-xs mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
              {trip.vehicleName ? `Vehicle: ${trip.vehicleName} · ` : ""}
              {trip.vehicleMpg ? `${trip.vehicleMpg.toFixed(0)} MPG` : "25 MPG average"}
            </p>
          </div>
          <p className="text-lg font-semibold">{estimatedGallons.toFixed(2)} gal</p>
        </div>
        <p className="text-xs mt-3 mb-2" style={{ color: "var(--md-on-surface-variant)" }}>
          Speed-aware estimate by recorded speed. MPG is adjusted for speed; the comparison below uses a flat average-MPG estimate.
        </p>
        {fuelBands.length > 0 ? (
          <div className="space-y-2">
            {fuelBands.map((band) => {
              const maxGallons = Math.max(0.0001, ...fuelBands.map((item) => item.gallons));
              const label = band.label
                .replace(/\d+/g, (value) => String(Math.round(convertSpeed(Number(value), distanceUnit))))
                .replace("mph", distanceUnit === "km" ? "km/h" : "mph");
              return (
                <div key={band.label}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span>{label} · {formatDistance(band.miles, distanceUnit)}</span>
                    <span className="font-medium">{band.gallons.toFixed(2)} gal</span>
                  </div>
                  <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: "var(--md-surface-container-high)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, band.gallons / maxGallons * 100)}%`, background: "var(--md-primary)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>No measurable route segments are available for a speed breakdown.</p>
        )}
        <p className="text-xs mt-3" style={{ color: "var(--md-on-surface-variant)" }}>
          Flat average-MPG estimate: {flatAverageGallons.toFixed(2)} gal
        </p>
      </section>

      {/* Gas entries linked to this trip */}
      {trip.gasEntries.length > 0 && (
        <div className="md-card animate-fade-in-up">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium" style={{ color: "var(--md-on-surface-variant)" }}>Fuel for this trip</h3>
            <span className="text-sm font-semibold">${gasTotal.toFixed(2)}</span>
          </div>
          <div className="space-y-2">
            {trip.gasEntries.map((g) => (
              <div key={g.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p>{g.stationName || "Fuel"} · {g.fuelType.toLowerCase()}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--md-on-surface-variant)" }}>
                    {format(new Date(g.date), "MMM d, yyyy")} · {g.gallons.toFixed(2)} gal × ${g.pricePerGallon.toFixed(3)}/gal
                  </p>
                </div>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="md-badge" style={{ background: g.paidBy === "PARENTS" ? "var(--md-tertiary-container)" : "var(--md-primary-container)", color: "var(--md-on-surface)" }}>
                    {payerLabel(g.paidBy)}
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
