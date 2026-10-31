"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";

interface ScheduledDrive {
  id: string;
  title: string;
  startAddress: string;
  endAddress: string;
  departure: string;
  scheduledArrival: string;
  estimatedTravelTime: number;
  repeatRule: string;
  category: string;
  paidBy: string;
  vehicleName: string | null;
  notes: string | null;
  isEnabled: boolean;
  isCanceled: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  skippedOccurrences: number[] | null;
  stops: Array<{ address?: string; lat: number; lng: number }> | null;
}

function isSkipped(drive: ScheduledDrive, date: Date): boolean {
  return (drive.skippedOccurrences ?? []).some((s) => Math.abs(s * 1000 - date.getTime()) < 60000);
}

const CATEGORY_LABELS: Record<string, string> = {
  COMMUTE: "Commute", ERRAND: "Errand", ROAD_TRIP: "Road Trip",
  SCHOOL: "School", WORK: "Work", LEISURE: "Leisure", OTHER: "Other",
};
const REPEAT_LABELS: Record<string, string> = {
  NONE: "Once", DAILY: "Daily", WEEKDAYS: "Weekdays", WEEKLY: "Weekly",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// True if this occurrence matches the drive's repeat rule. 0=Sun..6=Sat.
function matchesRule(drive: ScheduledDrive, date: Date): boolean {
  const wd = date.getDay();
  switch (drive.repeatRule) {
    case "DAILY": return true;
    case "WEEKDAYS": return wd >= 1 && wd <= 5;
    case "WEEKLY": return wd === new Date(drive.departure).getDay();
    default: return true; // NONE
  }
}

// Next concrete departure at or after `reference` for a (possibly repeating) drive — mirrors the
// iOS `nextDeparture`, including the first-departure guard so a drive whose first departure is still
// in the future never reports a phantom occurrence today.
function nextDeparture(drive: ScheduledDrive, reference: Date = new Date()): Date {
  const base = new Date(drive.departure);
  if (drive.repeatRule === "NONE") return base;
  const firstDay = startOfDay(base);
  const candidate = new Date(reference);
  candidate.setHours(base.getHours(), base.getMinutes(), 0, 0);
  for (let i = 0; i < 400; i++) {
    // Skip occurrences the user deleted "just this once", and never before the series' own start.
    if (candidate >= reference && candidate >= firstDay && matchesRule(drive, candidate) && !isSkipped(drive, candidate)) {
      return new Date(candidate);
    }
    candidate.setDate(candidate.getDate() + 1);
  }
  return base;
}

// Most recent occurrence at or before `reference`, or null if the drive's first occurrence is still
// in the future — mirrors the iOS `previousDeparture`.
function previousDeparture(drive: ScheduledDrive, reference: Date = new Date()): Date | null {
  const base = new Date(drive.departure);
  if (drive.repeatRule === "NONE") return base <= reference ? base : null;
  const firstDay = startOfDay(base);
  const candidate = new Date(reference);
  candidate.setHours(base.getHours(), base.getMinutes(), 0, 0);
  for (let i = 0; i < 400; i++) {
    if (candidate < firstDay) return null;
    if (candidate <= reference && matchesRule(drive, candidate) && !isSkipped(drive, candidate)) {
      return new Date(candidate);
    }
    candidate.setDate(candidate.getDate() - 1);
  }
  return null;
}

// The occurrence the on-time status is judged against: whichever scheduled departure — the most
// recent past one or the next upcoming one — is nearer to `now`. This way a drive whose scheduled
// window has already passed (and wasn't started) reads as LATE instead of silently rolling forward.
function statusReferenceDeparture(drive: ScheduledDrive, now: Date = new Date()): Date {
  const next = nextDeparture(drive, now);
  const prev = previousDeparture(drive, now);
  if (!prev || prev.getTime() === next.getTime()) return next;
  return Math.abs(now.getTime() - prev.getTime()) <= Math.abs(next.getTime() - now.getTime()) ? prev : next;
}

function statusFor(drive: ScheduledDrive, dep: Date): { label: string; color: string } {
  if (drive.isCanceled) return { label: "CANCELED", color: "var(--md-error)" };
  const now = Date.now();
  const budgetMs = new Date(drive.scheduledArrival).getTime() - new Date(drive.departure).getTime();
  const lo = dep.getTime() - 30 * 60000;
  const hi = dep.getTime() + budgetMs + 6 * 3600 * 1000;
  const started = drive.lastStartedAt ? new Date(drive.lastStartedAt).getTime() : null;
  const completed = drive.lastCompletedAt ? new Date(drive.lastCompletedAt).getTime() : null;
  const inWindow = (t: number | null) => t !== null && t >= lo && t <= hi;
  // This occurrence was actually driven → mark it departed instead of perpetually "LATE".
  if (inWindow(completed) || inWindow(started)) return { label: "DEPARTED", color: "var(--md-on-surface-variant)" };
  if (now < dep.getTime()) return { label: "ON TIME", color: "var(--md-success)" };
  return { label: "LATE", color: "var(--md-warning)" };
}

export default function SchedulePage() {
  const [drives, setDrives] = useState<ScheduledDrive[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const fetchDrives = useCallback(() => {
    return fetch("/api/scheduled")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load scheduled drives");
        return response.json();
      })
      .then((data: ScheduledDrive[]) => {
        setDrives(data);
        setLoadError("");
      });
  }, []);

  useEffect(() => {
    const refresh = () => { void fetchDrives().catch(() => setLoadError("Schedule couldn’t be synced. Check your connection and try again.")); };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, [fetchDrives]);

  // Cancel keeps the drive visible with a CANCELED status; Restore un-cancels it. The scheduled
  // PATCH route re-validates the whole record, so send back the full drive we already have.
  async function setCanceled(drive: ScheduledDrive, canceled: boolean) {
    try {
      const response = await fetch("/api/scheduled", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...drive, isCanceled: canceled }),
      });
      if (!response.ok) throw new Error("Could not update scheduled drive");
      const updated: ScheduledDrive = await response.json();
      setDrives((prev) => prev?.map((d) => (d.id === drive.id ? updated : d)) ?? prev);
      setLoadError("");
    } catch {
      setLoadError("Schedule couldn’t be updated. Check your connection and try again.");
    }
  }

  // Delete removes the template (and therefore every occurrence). The DELETE route reads the id
  // from the JSON body.
  async function deleteDrive(drive: ScheduledDrive) {
    if (!window.confirm(`Delete “${drive.title}”? This removes the drive and all of its occurrences.`)) return;
    try {
      const response = await fetch("/api/scheduled", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: drive.id }),
      });
      if (!response.ok) throw new Error("Could not delete scheduled drive");
      setDrives((prev) => prev?.filter((d) => d.id !== drive.id) ?? prev);
      setLoadError("");
    } catch {
      setLoadError("Schedule couldn’t be updated. Check your connection and try again.");
    }
  }

  const activeDrive = (drives ?? [])
    .filter((drive) => drive.lastStartedAt
      && (!drive.lastCompletedAt || new Date(drive.lastStartedAt) > new Date(drive.lastCompletedAt))
      && now - new Date(drive.lastStartedAt).getTime() < Math.max(6 * 60 * 60 * 1000, drive.estimatedTravelTime * 1000 + 2 * 60 * 60 * 1000))
    .sort((a, b) => new Date(b.lastStartedAt!).getTime() - new Date(a.lastStartedAt!).getTime())[0] ?? null;
  const activeDriveId = activeDrive?.id;

  useEffect(() => {
    if (!activeDriveId) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeDriveId]);

  if (!drives) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="skeleton h-8 w-40 rounded mb-6" />
        {loadError && (
          <div className="md-card mb-4" role="alert">
            <p className="text-sm" style={{ color: "var(--md-error)" }}>{loadError}</p>
            <button type="button" className="md-outlined-button mt-3" onClick={() => { void fetchDrives().catch(() => setLoadError("Schedule couldn’t be synced. Check your connection and try again.")); }}>
              Retry
            </button>
          </div>
        )}
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-2xl mb-3" />)}
      </div>
    );
  }

  const rows = drives
    .filter((d) => d.isEnabled !== false)
    .map((d) => ({ drive: d, dep: statusReferenceDeparture(d) }))
    .sort((a, b) => a.dep.getTime() - b.dep.getTime());

  return (
    <div className="p-6 max-w-4xl mx-auto page-enter">
      <div className="mb-6 animate-fade-in-up">
        <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
          {drives.length} scheduled {drives.length === 1 ? "drive" : "drives"} · synced from your iPhone
        </p>
      </div>

      {loadError && (
        <p role="alert" className="md-card mb-4 text-sm" style={{ color: "var(--md-error)" }}>
          {loadError}
        </p>
      )}

      {activeDrive && (
        <LiveDriveCard drive={activeDrive} now={now} />
      )}

      {rows.length === 0 ? (
        <div className="md-card text-center py-16 animate-scale-in">
          <p className="font-medium mb-1">Nothing scheduled</p>
          <p className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
            Schedule a drive in the iOS app and it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ drive, dep }, i) => {
            const status = statusFor(drive, dep);
            return (
              <div key={drive.id} className="md-card animate-fade-in-up" style={{ animationDelay: `${i * 40}ms`, opacity: drive.isCanceled ? 0.6 : 1 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="md-badge" style={{ background: "var(--md-primary-container)", color: "var(--md-on-primary-container)" }}>
                        {format(dep, "EEE, MMM d · h:mm a")}
                      </span>
                      <span className="md-badge" style={{ background: "var(--md-surface-container-high)" }}>
                        {REPEAT_LABELS[drive.repeatRule] || drive.repeatRule}
                      </span>
                      <span className="md-badge" style={{ background: drive.paidBy === "PARENTS" ? "var(--md-tertiary-container)" : "var(--md-primary-container)", color: "var(--md-on-surface)" }}>
                        {drive.paidBy === "PARENTS" ? "Parents pay" : "I pay"}
                      </span>
                    </div>
                    <p className="font-medium truncate">{drive.title}</p>
                    <p className="text-sm flex items-center gap-1.5" style={{ color: "var(--md-on-surface-variant)" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                      {drive.endAddress}
                    </p>
                    {drive.stops && drive.stops.length > 0 && (
                      <p className="text-xs mt-1 flex items-center gap-1 flex-wrap" style={{ color: "var(--md-on-surface-variant)" }}>
                        {drive.stops.map((s, i) => (
                          <span key={i} className="inline-flex items-center gap-1">
                            <span className="inline-flex items-center justify-center rounded-full text-white text-[9px] font-bold" style={{ width: 14, height: 14, background: "#e8a33d" }}>{i + 1}</span>
                            {s.address?.split(",")[0] || "stop"}
                          </span>
                        ))}
                      </p>
                    )}
                    <p className="text-xs mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
                      {CATEGORY_LABELS[drive.category] || drive.category}
                      {drive.vehicleName ? ` · ${drive.vehicleName}` : ""}
                      {drive.estimatedTravelTime ? ` · ${Math.round(drive.estimatedTravelTime / 60)} min drive` : ""}
                      {` · arrives ${format(new Date(drive.scheduledArrival), "h:mm a")}`}
                    </p>
                    {drive.notes && (
                      <p className="text-xs mt-1 italic" style={{ color: "var(--md-on-surface-variant)" }}>{drive.notes}</p>
                    )}
                  </div>
                  <span className="md-badge shrink-0" style={{ background: status.color, color: "#fff", fontWeight: 700 }}>
                    {status.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--md-outline-variant)" }}>
                  <button
                    onClick={() => setCanceled(drive, !drive.isCanceled)}
                    className="md-chip"
                    style={{ color: drive.isCanceled ? "var(--md-success)" : "var(--md-warning)" }}
                  >
                    {drive.isCanceled ? "Restore" : "Cancel"}
                  </button>
                  <button
                    onClick={() => deleteDrive(drive)}
                    className="md-chip"
                    style={{ color: "var(--md-error)" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LiveDriveCard({ drive, now }: { drive: ScheduledDrive; now: number }) {
  const startedAt = new Date(drive.lastStartedAt!);
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));
  const plannedSeconds = Math.max(drive.estimatedTravelTime, 0);
  const remainingSeconds = Math.max(plannedSeconds - elapsedSeconds, 0);
  const progress = plannedSeconds > 0 ? Math.min((elapsedSeconds / plannedSeconds) * 100, 100) : 0;
  const eta = new Date(startedAt.getTime() + plannedSeconds * 1000);
  const formatElapsed = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };
  const timeLabel = elapsedSeconds >= plannedSeconds ? `Past estimate · ${format(eta, "h:mm a")}` : `About ${formatElapsed(remainingSeconds)} left`;

  return (
    <section className="md-card mb-6 animate-fade-in-up" aria-label="Live drive">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-50 animate-ping" style={{ background: "var(--md-success)" }} />
            <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: "var(--md-success)" }} />
          </span>
          <div>
            <h2 className="font-semibold">Drive in progress</h2>
            <p className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>{drive.title}</p>
          </div>
        </div>
        <span className="md-badge" style={{ background: "var(--md-primary-container)", color: "var(--md-on-primary-container)" }}>
          Started {format(startedAt, "h:mm a")}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs mb-1" style={{ color: "var(--md-on-surface-variant)" }}>From</p>
          <p className="font-medium">{drive.startAddress}</p>
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: "var(--md-on-surface-variant)" }}>To</p>
          <p className="font-medium">{drive.endAddress}</p>
        </div>
      </div>

      {drive.stops && drive.stops.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4" aria-label="Stops along the route">
          {drive.stops.map((stop, index) => (
            <span key={index} className="md-badge" style={{ background: "var(--md-tertiary-container)", color: "var(--md-on-surface)" }}>
              Stop {index + 1}: {stop.address?.split(",")[0] || `${stop.lat.toFixed(3)}, ${stop.lng.toFixed(3)}`}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Elapsed", value: formatElapsed(elapsedSeconds) },
          { label: "Est. arrival", value: format(eta, "h:mm a") },
          { label: "Time estimate", value: `${Math.round(progress)}%` },
          { label: "Category", value: CATEGORY_LABELS[drive.category] || drive.category },
        ].map((item) => (
          <div key={item.label} className="rounded-xl p-3" style={{ background: "var(--md-surface-container)" }}>
            <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>{item.label}</p>
            <p className="font-semibold mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: "var(--md-surface-container-high)" }}
        role="progressbar" aria-label="Elapsed time against the drive estimate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${progress}%`, background: "var(--md-primary)" }} />
      </div>
      <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
        {timeLabel} · {REPEAT_LABELS[drive.repeatRule] || drive.repeatRule} schedule
        {drive.vehicleName ? ` · ${drive.vehicleName}` : ""}
        {` · ${drive.paidBy === "PARENTS" ? "Parents pay" : "I pay"}`}
      </p>
    </section>
  );
}
