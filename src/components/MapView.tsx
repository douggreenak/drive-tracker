"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [61.2181, -149.9003]; // Anchorage, AK
const DEFAULT_ZOOM = 11;

interface MapViewProps {
  onRouteSelect?: (route: {
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    startAddress: string;
    endAddress: string;
    distance: number;
    duration: number;
  }) => void;
  routes?: Array<{
    id: string;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    startAddress: string;
    endAddress: string;
    /// Google-style encoded polyline (precision 5) of the actual recorded route, if available.
    routeEncoded?: string | null;
    /// Intermediate stops to mark along the route.
    stops?: Array<{ address?: string; lat: number; lng: number }> | null;
  }>;
  interactive?: boolean;
}

/// Decode a Google-style encoded polyline (precision 5) into [lat, lng] pairs.
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

export default function MapView({
  onRouteSelect,
  routes,
  interactive = true,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const lineRef = useRef<L.Polyline | null>(null);
  const [startPoint, setStartPoint] = useState<L.LatLng | null>(null);
  const [endPoint, setEndPoint] = useState<L.LatLng | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    mapInstanceRef.current = map;

    if (routes && routes.length > 0) {
      const bounds = L.latLngBounds([]);
      routes.forEach((route) => {
        const startIcon = L.divIcon({
          className: "custom-marker",
          html: `<div style="width:12px;height:12px;border-radius:50%;background:var(--md-primary, #1a6b52);border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        const endIcon = L.divIcon({
          className: "custom-marker",
          html: `<div style="width:12px;height:12px;border-radius:50%;background:var(--md-tertiary, #3f6374);border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        L.marker([route.startLat, route.startLng], { icon: startIcon })
          .addTo(map)
          .bindPopup(`<b>Start:</b> ${route.startAddress}`);
        L.marker([route.endLat, route.endLng], { icon: endIcon })
          .addTo(map)
          .bindPopup(`<b>End:</b> ${route.endAddress}`);

        // Numbered pins for any intermediate stops.
        (route.stops ?? []).forEach((stop, i) => {
          const stopIcon = L.divIcon({
            className: "custom-marker",
            html: `<div style="width:18px;height:18px;border-radius:50%;background:#e8a33d;border:2px solid white;color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3)">${i + 1}</div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          });
          L.marker([stop.lat, stop.lng], { icon: stopIcon })
            .addTo(map)
            .bindPopup(`<b>Stop ${i + 1}:</b> ${stop.address ?? ""}`);
          bounds.extend([stop.lat, stop.lng]);
        });

        // Draw the actual recorded route when we have it; otherwise fall back to a straight line.
        const decoded = route.routeEncoded ? decodePolyline(route.routeEncoded) : null;
        if (decoded && decoded.length >= 2) {
          L.polyline(decoded, { color: "var(--md-primary, #1a6b52)", weight: 4, opacity: 0.85 }).addTo(map);
          decoded.forEach((p) => bounds.extend(p));
        } else {
          L.polyline(
            [
              [route.startLat, route.startLng],
              [route.endLat, route.endLng],
            ],
            { color: "var(--md-primary, #1a6b52)", weight: 3, opacity: 0.7, dashArray: "6 8" }
          ).addTo(map);
        }

        bounds.extend([route.startLat, route.startLng]);
        bounds.extend([route.endLat, route.endLng]);
      });
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }

    if (interactive && onRouteSelect) {
      map.on("click", (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;

        if (markersRef.current.length >= 2) {
          markersRef.current.forEach((m) => m.remove());
          markersRef.current = [];
          lineRef.current?.remove();
          lineRef.current = null;
          setStartPoint(null);
          setEndPoint(null);
        }

        const icon = L.divIcon({
          className: "custom-marker",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:${markersRef.current.length === 0 ? "var(--md-primary, #1a6b52)" : "var(--md-tertiary, #3f6374)"};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const marker = L.marker([lat, lng], { icon }).addTo(map);
        markersRef.current.push(marker);

        if (markersRef.current.length === 1) {
          setStartPoint(e.latlng);
        } else if (markersRef.current.length === 2) {
          setEndPoint(e.latlng);
          const start = markersRef.current[0].getLatLng();
          const end = e.latlng;

          const line = L.polyline(
            [
              [start.lat, start.lng],
              [end.lat, end.lng],
            ],
            {
              color: "var(--md-primary, #1a6b52)",
              weight: 4,
              dashArray: "8, 8",
            }
          ).addTo(map);
          lineRef.current = line;

          const distKm = start.distanceTo(end) / 1000;
          const distMiles = distKm * 0.621371;
          const durationMin = Math.round((distMiles / 35) * 60);

          onRouteSelect({
            startLat: start.lat,
            startLng: start.lng,
            endLat: end.lat,
            endLng: end.lng,
            startAddress: `${start.lat.toFixed(4)}, ${start.lng.toFixed(4)}`,
            endAddress: `${end.lat.toFixed(4)}, ${end.lng.toFixed(4)}`,
            distance: Math.round(distMiles * 10) / 10,
            duration: durationMin,
          });
        }
      });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div ref={mapRef} className="w-full h-full rounded-2xl" />
      {interactive && (
        <div
          className="absolute top-3 left-3 z-[1000] px-3 py-2 rounded-lg text-xs font-medium"
          style={{
            background: "var(--md-surface-container)",
            color: "var(--md-on-surface-variant)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          }}
        >
          {!startPoint
            ? "Click map to set start point"
            : !endPoint
              ? "Click map to set end point"
              : "Click map to reset route"}
        </div>
      )}
    </div>
  );
}
