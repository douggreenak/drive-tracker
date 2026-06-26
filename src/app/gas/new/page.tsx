"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import AnimatedCounter from "@/components/AnimatedCounter";

interface Trip {
  id: string;
  date: string;
  startAddress: string;
  endAddress: string;
}

const FUEL_TYPES = [
  { value: "REGULAR", label: "Regular", desc: "87" },
  { value: "MIDGRADE", label: "Midgrade", desc: "89" },
  { value: "PREMIUM", label: "Premium", desc: "91+" },
  { value: "DIESEL", label: "Diesel", desc: "" },
];

export default function NewGasEntryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [gallons, setGallons] = useState("");
  const [pricePerGallon, setPricePerGallon] = useState("");
  const [paidBy, setPaidBy] = useState<"SELF" | "PARENTS">("SELF");
  const [fuelType, setFuelType] = useState("REGULAR");
  const [stationName, setStationName] = useState("");
  const [odometer, setOdometer] = useState("");
  const [tripId, setTripId] = useState("");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/trips")
      .then((r) => r.json())
      .then(setTrips)
      .catch(() => {});
  }, []);

  const totalCost =
    gallons && pricePerGallon
      ? parseFloat(gallons) * parseFloat(pricePerGallon)
      : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/gas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          gallons: parseFloat(gallons),
          pricePerGallon: parseFloat(pricePerGallon),
          paidBy, fuelType,
          stationName: stationName || null,
          odometer: odometer ? parseFloat(odometer) : null,
          tripId: tripId || null,
        }),
      });
      if (res.ok) {
        toast("Gas entry saved");
        router.push("/gas");
      }
    } catch {
      toast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto page-enter">
      <div className="mb-6 animate-fade-in-up">
        <button onClick={() => router.back()} className="md-tonal-button mb-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>
        <h1 className="text-2xl font-bold tracking-tight">Add Gas Entry</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Live Cost Display */}
        <div
          className="md-card text-center animate-scale-in"
          style={{ background: "var(--md-primary-container)" }}
        >
          <p className="text-xs font-medium mb-1" style={{ color: "var(--md-on-primary-container)" }}>
            Total Cost
          </p>
          <AnimatedCounter
            value={totalCost}
            prefix="$"
            decimals={2}
            className="text-4xl font-bold block"
            duration={300}
          />
        </div>

        {/* Who's Paying */}
        <div className="animate-fade-in-up stagger-2">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--md-on-surface-variant)" }}>
            Who&apos;s paying?
          </label>
          <div className="flex gap-2">
            {(["SELF", "PARENTS"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setPaidBy(opt)}
                className={`md-chip flex-1 justify-center ${paidBy === opt ? "active" : ""}`}
              >
                {opt === "SELF" ? "Me" : "Parents"}
              </button>
            ))}
          </div>
        </div>

        {/* Fuel Type */}
        <div className="animate-fade-in-up stagger-3">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--md-on-surface-variant)" }}>
            Fuel Type
          </label>
          <div className="flex gap-2 flex-wrap">
            {FUEL_TYPES.map((ft) => (
              <button
                key={ft.value}
                type="button"
                onClick={() => setFuelType(ft.value)}
                className={`md-chip ${fuelType === ft.value ? "active" : ""}`}
              >
                {ft.label} {ft.desc && <span className="opacity-60 text-xs">{ft.desc}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="animate-fade-in-up stagger-4">
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--md-on-surface-variant)" }}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="md-text-field" required />
        </div>

        <div className="grid grid-cols-2 gap-4 animate-fade-in-up stagger-5">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--md-on-surface-variant)" }}>Gallons</label>
            <input type="number" step="0.01" min="0" value={gallons} onChange={(e) => setGallons(e.target.value)} placeholder="0.00" className="md-text-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--md-on-surface-variant)" }}>Price/Gallon</label>
            <input type="number" step="0.01" min="0" value={pricePerGallon} onChange={(e) => setPricePerGallon(e.target.value)} placeholder="0.00" className="md-text-field" required />
          </div>
        </div>

        <div className="animate-fade-in-up stagger-6">
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--md-on-surface-variant)" }}>Station Name (optional)</label>
          <input type="text" value={stationName} onChange={(e) => setStationName(e.target.value)} placeholder="e.g. Shell, Costco..." className="md-text-field" />
        </div>

        <div className="animate-fade-in-up stagger-7">
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--md-on-surface-variant)" }}>Odometer (optional)</label>
          <input type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="Current mileage" className="md-text-field" />
        </div>

        {trips.length > 0 && (
          <div className="animate-fade-in-up stagger-8">
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--md-on-surface-variant)" }}>Link to Trip (optional)</label>
            <select value={tripId} onChange={(e) => setTripId(e.target.value)} className="md-text-field">
              <option value="">None</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>{t.startAddress} → {t.endAddress}</option>
              ))}
            </select>
          </div>
        )}

        <button
          type="submit"
          disabled={!gallons || !pricePerGallon || saving}
          className="md-filled-button w-full"
        >
          {saving ? (
            <>
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            "Save Gas Entry"
          )}
        </button>
      </form>
    </div>
  );
}
