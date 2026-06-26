"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

interface Settings {
  id: string;
  monthlyBudget: number;
  distanceUnit: string;
  currency: string;
  theme: string;
}

interface Vehicle {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  tankSize: number | null;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [budget, setBudget] = useState("");
  const [unit, setUnit] = useState("miles");
  const [saving, setSaving] = useState(false);

  const [vehicleName, setVehicleName] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleTank, setVehicleTank] = useState("");
  const [showVehicleForm, setShowVehicleForm] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings);
        setVehicles(data.vehicles);
        setBudget(data.settings.monthlyBudget?.toString() || "0");
        setUnit(data.settings.distanceUnit || "miles");
      })
      .catch(() => {});
  }, []);

  async function saveSettings() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyBudget: parseFloat(budget) || 0,
          distanceUnit: unit,
        }),
      });
      toast("Settings saved");
    } catch {
      toast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle: {
            name: vehicleName,
            make: vehicleMake || null,
            model: vehicleModel || null,
            year: vehicleYear ? parseInt(vehicleYear) : null,
            tankSize: vehicleTank ? parseFloat(vehicleTank) : null,
          },
        }),
      });
      if (res.ok) {
        const vehicle = await res.json();
        setVehicles((prev) => [...prev, vehicle]);
        setVehicleName("");
        setVehicleMake("");
        setVehicleModel("");
        setVehicleYear("");
        setVehicleTank("");
        setShowVehicleForm(false);
        toast("Vehicle added");
      }
    } catch {
      toast("Failed to add vehicle", "error");
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto page-enter">
      <div className="mb-6 animate-fade-in-up">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--md-on-surface-variant)" }}>
          Configure your preferences
        </p>
      </div>

      {/* Budget Section */}
      <div className="md-card mb-4 animate-fade-in-up stagger-1">
        <h3 className="text-sm font-semibold mb-3">Monthly Gas Budget</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs mb-1" style={{ color: "var(--md-on-surface-variant)" }}>
              Budget Amount ($)
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="0"
              className="md-text-field"
            />
          </div>
          <button onClick={saveSettings} disabled={saving} className="md-filled-button">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--md-on-surface-variant)" }}>
          Set to 0 to disable budget tracking
        </p>
      </div>

      {/* Units Section */}
      <div className="md-card mb-4 animate-fade-in-up stagger-2">
        <h3 className="text-sm font-semibold mb-3">Distance Unit</h3>
        <div className="flex gap-2">
          {["miles", "km"].map((u) => (
            <button
              key={u}
              onClick={() => { setUnit(u); }}
              className={`md-chip flex-1 justify-center ${unit === u ? "active" : ""}`}
            >
              {u === "miles" ? "Miles" : "Kilometers"}
            </button>
          ))}
        </div>
      </div>

      {/* Vehicle Section */}
      <div className="md-card mb-4 animate-fade-in-up stagger-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Vehicles</h3>
          <button
            onClick={() => setShowVehicleForm(!showVehicleForm)}
            className="md-tonal-button"
          >
            {showVehicleForm ? "Cancel" : "+ Add Vehicle"}
          </button>
        </div>

        {vehicles.length > 0 && (
          <div className="space-y-2 mb-3">
            {vehicles.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "var(--md-surface-container)" }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: "var(--md-primary-container)" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--md-on-primary-container)" strokeWidth="2">
                    <path d="M5 17h14M5 17a2 2 0 01-2-2V8a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v7a2 2 0 01-2 2M7 17v2m10-2v2"/>
                    <circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-sm">{v.name}</p>
                  <p className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>
                    {[v.year, v.make, v.model].filter(Boolean).join(" ") || "No details"}
                    {v.tankSize && ` · ${v.tankSize} gal tank`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {showVehicleForm && (
          <form onSubmit={addVehicle} className="space-y-3 animate-slide-down">
            <input type="text" value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} placeholder="Vehicle nickname *" className="md-text-field" required />
            <div className="grid grid-cols-2 gap-3">
              <input type="text" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} placeholder="Make" className="md-text-field" />
              <input type="text" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="Model" className="md-text-field" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} placeholder="Year" className="md-text-field" />
              <input type="number" step="0.1" value={vehicleTank} onChange={(e) => setVehicleTank(e.target.value)} placeholder="Tank size (gal)" className="md-text-field" />
            </div>
            <button type="submit" className="md-filled-button w-full">Save Vehicle</button>
          </form>
        )}

        {vehicles.length === 0 && !showVehicleForm && (
          <p className="text-sm" style={{ color: "var(--md-on-surface-variant)" }}>
            No vehicles added yet
          </p>
        )}
      </div>

      {/* Export Section */}
      <div className="md-card animate-fade-in-up stagger-4">
        <h3 className="text-sm font-semibold mb-3">Data</h3>
        <a href="/api/export" download className="md-outlined-button w-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export All Data as CSV
        </a>
      </div>
    </div>
  );
}
