"use client";

import { useEffect, useState } from "react";

export type DistanceUnit = "miles" | "km";

export function useDistanceUnit(): DistanceUnit {
  const [unit, setUnit] = useState<DistanceUnit>("miles");

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load distance preference");
        return response.json();
      })
      .then((data) => setUnit(data.settings?.distanceUnit === "km" ? "km" : "miles"))
      .catch(() => setUnit("miles"));
  }, []);

  return unit;
}

export function formatDistance(miles: number, unit: DistanceUnit, decimals = 1): string {
  const distance = unit === "km" ? miles * 1.60934 : miles;
  return `${distance.toFixed(decimals)} ${unit === "km" ? "km" : "mi"}`;
}

export function convertSpeed(mph: number, unit: DistanceUnit): number {
  return unit === "km" ? mph * 1.60934 : mph;
}
