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

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    window.dispatchEvent(new CustomEvent("dt-copied"));
  } catch {}
}

const mcpCommand = (base: string, token: string) =>
  `claude mcp add --transport http drive-tracker ${base}/mcp \\\n  --header "Authorization: Bearer ${token}"`;

function apiDocs(c: { baseUrl: string; apiKey: string | null }) {
  return `Drive Tracker REST API
Base URL: ${c.baseUrl}
API key: ${c.apiKey ?? "(not configured)"}
Auth: send header "x-api-key: <key>" or "Authorization: Bearer <key>" on every /api/* call.
OpenAPI spec: ${c.baseUrl}/api/openapi
Units: distances in miles, durations in seconds.

Endpoints (JSON):
  /api/trips            GET (search, category, favorites, from, to, sort, order, page, pageSize, full, includeRoute), POST, PATCH, DELETE
  /api/trips/{id}       GET
  /api/trips/{id}/points GET
  /api/gas              GET, POST, PATCH, DELETE
  /api/vehicles         GET, POST, PATCH, DELETE
  /api/scheduled        GET, POST, PATCH, DELETE
  /api/saved-places     GET, POST, PATCH, DELETE
  /api/payer-groups     GET, POST, PATCH, DELETE
  /api/settings         GET, PUT
  /api/stats            GET (period=30d|90d|12m)
  /api/analytics        GET
  /api/export           GET (CSV)

Example:
  curl ${c.baseUrl}/api/trips -H "x-api-key: ${c.apiKey ?? "<key>"}"
`;
}

function mcpDocs(base: string, token: string) {
  return `Drive Tracker MCP server
Endpoint: ${base}/mcp (Streamable HTTP, stateless)
Token (valid 5 years): ${token}
Auth: "Authorization: Bearer <token>". Separate from the REST API key; it does not work on /api/*.

Add to Claude Code:
  ${mcpCommand(base, token).replace(/\n/g, "\n  ")}

Tools: get_stats, list_trips, get_trip, log_trip, update_trip, list_gas_entries, add_gas_entry,
list_vehicles, list_scheduled_drives, list_saved_places, list_payer_groups, get_settings.
There is deliberately no delete tool. Rotating MCP_TOKEN_SECRET revokes all tokens.
`;
}

function CopyBlock({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const { toast } = useToast();
  const [shown, setShown] = useState(!secret);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast("Copied");
    } catch {
      toast("Copy failed", "error");
    }
  }
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: "var(--md-on-surface-variant)" }}>{label}</span>
        <span className="flex gap-2">
          {secret && (
            <button type="button" onClick={() => setShown(!shown)} className="md-tonal-button">
              {shown ? "Hide" : "Show"}
            </button>
          )}
          <button type="button" onClick={copy} className="md-tonal-button">Copy</button>
        </span>
      </div>
      <pre
        className="text-xs p-3 rounded-xl overflow-x-auto whitespace-pre-wrap break-all select-all"
        style={{ background: "var(--md-surface-container)" }}
      >
        {shown ? value : value.replace(/[^\s]/g, "•").slice(0, 40)}
      </pre>
    </div>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [budget, setBudget] = useState("");
  const [unit, setUnit] = useState("miles");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [vehicleName, setVehicleName] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleTank, setVehicleTank] = useState("");
  const [showVehicleForm, setShowVehicleForm] = useState(false);

  const [conn, setConn] = useState<{ baseUrl: string; apiKey: string | null; mcpAvailable: boolean } | null>(null);
  const [mcpToken, setMcpToken] = useState("");

  useEffect(() => {
    fetch("/api/connection")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setConn(d))
      .catch(() => {});
  }, []);

  async function generateMcpToken(): Promise<string> {
    try {
      const res = await fetch("/api/connection", { method: "POST" });
      if (!res.ok) throw new Error();
      const { token } = await res.json();
      setMcpToken(token);
      return token;
    } catch {
      toast("Could not generate token", "error");
      return "";
    }
  }

  async function copyAllMcp() {
    if (!conn) return;
    const token = mcpToken || (await generateMcpToken());
    if (token) await copyText(mcpDocs(conn.baseUrl, token));
  }

  useEffect(() => {
    const onCopied = () => toast("Copied");
    window.addEventListener("dt-copied", onCopied);
    return () => window.removeEventListener("dt-copied", onCopied);
  }, [toast]);

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
    setSaveError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyBudget: parseFloat(budget) || 0,
          distanceUnit: unit,
        }),
      });
      if (!response.ok) throw new Error("Could not save settings");
      toast("Settings saved");
    } catch {
      setSaveError("Settings couldn’t be saved. Check your connection and try again.");
      toast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveDistanceUnit(nextUnit: string) {
    const previous = unit;
    setUnit(nextUnit);
    setSaveError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distanceUnit: nextUnit }),
      });
      if (!response.ok) throw new Error("Could not save distance unit");
      toast("Distance unit saved");
    } catch {
      setUnit(previous);
      setSaveError("Distance unit couldn’t be saved.");
      toast("Failed to save distance unit", "error");
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
        {saveError && <p role="alert" className="text-xs mt-2" style={{ color: "var(--md-error)" }}>{saveError}</p>}
      </div>

      {/* Units Section */}
      <div className="md-card mb-4 animate-fade-in-up stagger-2">
        <h3 className="text-sm font-semibold mb-3">Distance Unit</h3>
        <div className="flex gap-2">
          {["miles", "km"].map((u) => (
            <button
              key={u}
              onClick={() => { if (unit !== u) void saveDistanceUnit(u); }}
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

      {/* REST API Section */}
      {conn && (
        <div className="md-card mb-4 animate-fade-in-up stagger-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold">REST API</h3>
            <button type="button" onClick={() => copyText(apiDocs(conn))} className="md-tonal-button">
              Copy all
            </button>
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--md-on-surface-variant)" }}>
            Keep these private — anyone with them can read and edit your data.
          </p>
          <CopyBlock label="Base URL" value={conn.baseUrl} />
          <CopyBlock label="OpenAPI spec" value={`${conn.baseUrl}/api/openapi`} />
          {conn.apiKey ? (
            <>
              <CopyBlock label="API key (x-api-key or Bearer)" value={conn.apiKey} secret />
              <CopyBlock
                label="Example"
                value={`curl ${conn.baseUrl}/api/trips \\\n  -H "x-api-key: ${conn.apiKey}"`}
                secret
              />
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--md-error)" }}>
              API_KEY is not set on the server.
            </p>
          )}
        </div>
      )}

      {/* MCP Section */}
      {conn && (
        <div className="md-card mb-4 animate-fade-in-up stagger-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold">MCP Server</h3>
            {conn.mcpAvailable && (
              <button type="button" onClick={copyAllMcp} className="md-tonal-button">
                Copy all
              </button>
            )}
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--md-on-surface-variant)" }}>
            Separate credential from the REST API key. The token does not work on /api/*.
          </p>
          <CopyBlock label="MCP endpoint" value={`${conn.baseUrl}/mcp`} />
          {conn.mcpAvailable ? (
            mcpToken ? (
              <>
                <CopyBlock label="MCP token (valid 5 years)" value={mcpToken} secret />
                <CopyBlock label="Claude Code command" value={mcpCommand(conn.baseUrl, mcpToken)} secret />
              </>
            ) : (
              <button type="button" onClick={() => void generateMcpToken()} className="md-outlined-button w-full">
                Generate MCP token
              </button>
            )
          ) : (
            <p className="text-xs" style={{ color: "var(--md-error)" }}>
              MCP_TOKEN_SECRET is not set on the server. Add it as an environment variable in Vercel
              (any long random string), redeploy, then reload this page.
            </p>
          )}
        </div>
      )}

      {/* Export Section */}
      <div className="md-card animate-fade-in-up stagger-6">
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
