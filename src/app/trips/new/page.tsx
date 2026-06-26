"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useToast } from "@/components/Toast";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

interface RouteData {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startAddress: string;
  endAddress: string;
  distance: number;
  duration: number;
}

const CATEGORIES = [
  { value: "COMMUTE", label: "Commute", icon: "🏠" },
  { value: "ERRAND", label: "Errand", icon: "🛒" },
  { value: "SCHOOL", label: "School", icon: "🎓" },
  { value: "WORK", label: "Work", icon: "💼" },
  { value: "ROAD_TRIP", label: "Road Trip", icon: "🛣️" },
  { value: "LEISURE", label: "Leisure", icon: "🎯" },
  { value: "OTHER", label: "Other", icon: "📍" },
];

export default function NewTripPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [route, setRoute] = useState<RouteData | null>(null);
  const [startAddress, setStartAddress] = useState("");
  const [endAddress, setEndAddress] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [saving, setSaving] = useState(false);

  function handleRouteSelect(data: RouteData) {
    setRoute(data);
    if (!startAddress) setStartAddress(data.startAddress);
    if (!endAddress) setEndAddress(data.endAddress);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!route) return;

    setSaving(true);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date, category,
          startAddress: startAddress || route.startAddress,
          endAddress: endAddress || route.endAddress,
          startLat: route.startLat, startLng: route.startLng,
          endLat: route.endLat, endLng: route.endLng,
          distance: route.distance, duration: route.duration,
          notes: notes || null,
        }),
      });
      if (res.ok) {
        toast("Trip saved successfully");
        router.push("/trips");
      }
    } catch {
      toast("Failed to save trip", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto page-enter">
      <div className="mb-6 animate-fade-in-up">
        <button
          onClick={() => router.back()}
          className="md-tonal-button mb-3"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>
        <h1 className="text-2xl font-bold tracking-tight">Log New Trip</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--md-on-surface-variant)" }}>
          Click the map to set your start and end points
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[400px] lg:h-[500px] rounded-2xl overflow-hidden md-elevation-2 animate-fade-in-up stagger-2">
          <MapView onRouteSelect={handleRouteSelect} interactive />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-up stagger-3">
          {route && (
            <div
              className="md-card animate-scale-in"
              style={{ background: "var(--md-primary-container)" }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: "var(--md-on-primary-container)" }}>
                Route Selected
              </p>
              <p className="text-lg font-semibold" style={{ color: "var(--md-on-primary-container)" }}>
                {route.distance} miles · ~{route.duration} min
              </p>
            </div>
          )}

          {/* Category Selector */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--md-on-surface-variant)" }}>
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`md-chip ${category === cat.value ? "active" : ""}`}
                >
                  <span>{cat.icon}</span> {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--md-on-surface-variant)" }}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="md-text-field" required />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--md-on-surface-variant)" }}>Start Location</label>
            <input type="text" value={startAddress} onChange={(e) => setStartAddress(e.target.value)} placeholder="e.g. Home, 123 Main St..." className="md-text-field" required />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--md-on-surface-variant)" }}>End Location</label>
            <input type="text" value={endAddress} onChange={(e) => setEndAddress(e.target.value)} placeholder="e.g. School, Work..." className="md-text-field" required />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--md-on-surface-variant)" }}>Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any details about this trip..." className="md-text-field min-h-[80px] resize-y" />
          </div>

          <button
            type="submit"
            disabled={!route || saving}
            className="md-filled-button w-full"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              "Save Trip"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
