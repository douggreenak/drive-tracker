"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

interface ScheduledDrive {
  id: string;
  title: string;
  startAddress: string;
  endAddress: string;
  departure: string;
  scheduledArrival: string;
  repeatRule: string;
  category: string;
  paidBy: string;
  vehicleName: string | null;
  isCanceled: boolean;
  lastStartedAt: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  COMMUTE: "Commute", ERRAND: "Errand", ROAD_TRIP: "Road Trip",
  SCHOOL: "School", WORK: "Work", LEISURE: "Leisure", OTHER: "Other",
};
const REPEAT_LABELS: Record<string, string> = {
  NONE: "Once", DAILY: "Daily", WEEKDAYS: "Weekdays", WEEKLY: "Weekly",
};

// Next concrete departure for a (possibly repeating) drive — mirrors the iOS occurrence logic
// closely enough for a read-only overview.
function nextDeparture(drive: ScheduledDrive): Date {
  const base = new Date(drive.departure);
  if (drive.repeatRule === "NONE") return base;
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(base.getHours(), base.getMinutes(), 0, 0);
  for (let i = 0; i < 400; i++) {
    const wd = candidate.getDay(); // 0=Sun..6=Sat
    const matches =
      drive.repeatRule === "DAILY" ||
      (drive.repeatRule === "WEEKDAYS" && wd >= 1 && wd <= 5) ||
      (drive.repeatRule === "WEEKLY" && wd === base.getDay());
    if (candidate >= now && matches) return new Date(candidate);
    candidate.setDate(candidate.getDate() + 1);
  }
  return base;
}

function statusFor(drive: ScheduledDrive, dep: Date): { label: string; color: string } {
  if (drive.isCanceled) return { label: "CANCELED", color: "var(--md-error)" };
  const now = new Date();
  if (now < dep) return { label: "ON TIME", color: "var(--md-success)" };
  return { label: "LATE", color: "var(--md-warning)" };
}

export default function SchedulePage() {
  const [drives, setDrives] = useState<ScheduledDrive[] | null>(null);

  useEffect(() => {
    fetch("/api/scheduled").then((r) => r.json()).then(setDrives).catch(() => setDrives([]));
  }, []);

  if (!drives) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="skeleton h-8 w-40 rounded mb-6" />
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-2xl mb-3" />)}
      </div>
    );
  }

  const rows = drives
    .map((d) => ({ drive: d, dep: nextDeparture(d) }))
    .sort((a, b) => a.dep.getTime() - b.dep.getTime());

  return (
    <div className="p-6 max-w-4xl mx-auto page-enter">
      <div className="mb-6 animate-fade-in-up">
        <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
          {drives.length} scheduled {drives.length === 1 ? "drive" : "drives"} · synced from your iPhone
        </p>
      </div>

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
                    <p className="text-xs mt-1" style={{ color: "var(--md-on-surface-variant)" }}>
                      {CATEGORY_LABELS[drive.category] || drive.category}
                      {drive.vehicleName ? ` · ${drive.vehicleName}` : ""}
                      {` · arrives ${format(new Date(drive.scheduledArrival), "h:mm a")}`}
                    </p>
                  </div>
                  <span className="md-badge shrink-0" style={{ background: status.color, color: "#fff", fontWeight: 700 }}>
                    {status.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
