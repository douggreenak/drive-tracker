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
    /// Matched road geometry returned by the iOS trip recorder.
    matchedPolyline?: string | null;
    /// Recorded positions which did not match a road.
    deviationPoints?: [number, number][];
  }>;
  trackPlayback?: {
    points: [number, number][];
    index: number;
  } | null;
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

function decodeMatchedPolyline(encoded: string): [number, number][] {
  try {
    const parsed: unknown = JSON.parse(atob(encoded));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((point): point is [number, number] =>
      Array.isArray(point) && point.length >= 2
      && typeof point[0] === "number" && Number.isFinite(point[0]) && point[0] >= -90 && point[0] <= 90
      && typeof point[1] === "number" && Number.isFinite(point[1]) && point[1] >= -180 && point[1] <= 180
    );
  } catch {
    return [];
  }
}

export default function MapView({
  onRouteSelect,
  routes,
  trackPlayback = null,
  interactive = true,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routesLayerRef = useRef<L.LayerGroup | null>(null);
  const playbackLineRef = useRef<L.Polyline | null>(null);
  const playbackMarkerRef = useRef<L.Marker | null>(null);
  const onRouteSelectRef = useRef(onRouteSelect);
  const markersRef = useRef<L.Marker[]>([]);
  const lineRef = useRef<L.Polyline | null>(null);
  const [startPoint, setStartPoint] = useState<L.LatLng | null>(null);
  const [endPoint, setEndPoint] = useState<L.LatLng | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    onRouteSelectRef.current = onRouteSelect;
  }, [onRouteSelect]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    mapInstanceRef.current = map;
    routesLayerRef.current = L.layerGroup().addTo(map);
    setMapReady(true);

    if (interactive) {
      map.on("click", (e: L.LeafletMouseEvent) => {
        const selectRoute = onRouteSelectRef.current;
        if (!selectRoute) return;
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
          lineRef.current = L.polyline([[start.lat, start.lng], [end.lat, end.lng]], {
            color: "var(--md-primary, #1a6b52)",
            weight: 4,
            dashArray: "8, 8",
          }).addTo(map);

          const distMiles = (start.distanceTo(end) / 1000) * 0.621371;
          selectRoute({
            startLat: start.lat,
            startLng: start.lng,
            endLat: end.lat,
            endLng: end.lng,
            startAddress: `${start.lat.toFixed(4)}, ${start.lng.toFixed(4)}`,
            endAddress: `${end.lat.toFixed(4)}, ${end.lng.toFixed(4)}`,
            distance: Math.round(distMiles * 10) / 10,
            duration: Math.round((distMiles / 35) * 60),
          });
        }
      });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      routesLayerRef.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = routesLayerRef.current;
    if (!mapReady || !map || !layer) return;
    layer.clearLayers();

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
          .addTo(layer)
          .bindPopup(popupContent("Start", route.startAddress));
        L.marker([route.endLat, route.endLng], { icon: endIcon })
          .addTo(layer)
          .bindPopup(popupContent("End", route.endAddress));

        // Numbered pins for any intermediate stops.
        (route.stops ?? []).forEach((stop, i) => {
          const stopIcon = L.divIcon({
            className: "custom-marker",
            html: `<div style="width:18px;height:18px;border-radius:50%;background:#e8a33d;border:2px solid white;color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3)">${i + 1}</div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          });
          L.marker([stop.lat, stop.lng], { icon: stopIcon })
            .addTo(layer)
            .bindPopup(popupContent(`Stop ${i + 1}`, stop.address ?? ""));
          bounds.extend([stop.lat, stop.lng]);
        });

        // Prefer the road-matched path when available; otherwise use the recorded route.
        const matched = route.matchedPolyline ? decodeMatchedPolyline(route.matchedPolyline) : [];
        const decoded = !matched.length && route.routeEncoded ? decodePolyline(route.routeEncoded) : null;
        if (matched.length >= 2) {
          L.polyline(matched, { color: "#3984b6", weight: 4, opacity: 0.9 }).addTo(layer);
          matched.forEach((point) => bounds.extend(point));
        } else if (decoded && decoded.length >= 2) {
          L.polyline(decoded, { color: "var(--md-primary, #1a6b52)", weight: 4, opacity: 0.85 }).addTo(layer);
          decoded.forEach((p) => bounds.extend(p));
        } else {
          L.polyline(
            [
              [route.startLat, route.startLng],
              [route.endLat, route.endLng],
            ],
            { color: "var(--md-primary, #1a6b52)", weight: 3, opacity: 0.7, dashArray: "6 8" }
          ).addTo(layer);
        }

        (route.deviationPoints ?? []).slice(0, 200).forEach((point) => {
          L.circleMarker(point, {
            radius: 4,
            color: "#a84d14",
            weight: 1,
            fillColor: "#f3a34b",
            fillOpacity: 0.9,
          }).addTo(layer);
        });

        bounds.extend([route.startLat, route.startLng]);
        bounds.extend([route.endLat, route.endLng]);
      });
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [mapReady, routes]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map) return;
    if (!trackPlayback || trackPlayback.points.length === 0) {
      playbackLineRef.current?.remove();
      playbackMarkerRef.current?.remove();
      playbackLineRef.current = null;
      playbackMarkerRef.current = null;
      return;
    }

    const lastIndex = Math.min(Math.max(trackPlayback.index, 0), trackPlayback.points.length - 1);
    const currentPoint = trackPlayback.points[lastIndex];
    const segment = trackPlayback.points.slice(0, lastIndex + 1);
    const maxVertices = 500;
    const stride = Math.max(1, Math.ceil(segment.length / maxVertices));
    const visiblePath = segment.filter((_, index) => index % stride === 0);
    if (visiblePath.at(-1) !== currentPoint) visiblePath.push(currentPoint);

    if (!playbackLineRef.current) {
      playbackLineRef.current = L.polyline(visiblePath, {
        color: "var(--md-primary, #1a6b52)",
        weight: 5,
        opacity: 1,
      }).addTo(map);
    } else {
      playbackLineRef.current.setLatLngs(visiblePath);
    }

    if (!playbackMarkerRef.current) {
      const icon = L.divIcon({
        className: "custom-marker",
        html: '<div style="width:20px;height:20px;border-radius:50%;background:#1976d2;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.45)"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      playbackMarkerRef.current = L.marker(currentPoint, { icon, zIndexOffset: 1000 }).addTo(map);
    } else {
      playbackMarkerRef.current.setLatLng(currentPoint);
    }
  }, [mapReady, trackPlayback]);

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

function popupContent(label: string, value: string): HTMLElement {
  const content = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = `${label}: `;
  content.append(title, document.createTextNode(value));
  return content;
}
