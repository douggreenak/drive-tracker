-- Multi-stop waypoints (JSON array of {address,lat,lng}) on trips and scheduled drives.
ALTER TABLE "Trip" ADD COLUMN "stops" JSONB;
ALTER TABLE "ScheduledDrive" ADD COLUMN "stops" JSONB;
