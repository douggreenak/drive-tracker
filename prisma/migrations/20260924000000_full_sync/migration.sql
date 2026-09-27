-- Full sync: mirror every local iOS entity (track points, payer groups, saved places, and the
-- rest of Vehicle/Settings/Trip/ScheduledDrive's fields) so a fresh install can restore everything
-- from the cloud instead of only trips/schedules' lightweight summary + gas.

-- `paidBy` becomes a free-form string everywhere it appears: the iOS app already lets the user
-- add payer groups beyond the built-in "Me"/"Parents", so a fixed SELF/PARENTS enum can no longer
-- represent every value the client will send. Existing enum values survive the cast unchanged.
ALTER TABLE "Trip" ALTER COLUMN "paidBy" DROP DEFAULT;
ALTER TABLE "Trip" ALTER COLUMN "paidBy" TYPE TEXT USING "paidBy"::TEXT;
ALTER TABLE "Trip" ALTER COLUMN "paidBy" SET DEFAULT 'SELF';

ALTER TABLE "GasEntry" ALTER COLUMN "paidBy" TYPE TEXT USING "paidBy"::TEXT;

ALTER TABLE "ScheduledDrive" ALTER COLUMN "paidBy" DROP DEFAULT;
ALTER TABLE "ScheduledDrive" ALTER COLUMN "paidBy" TYPE TEXT USING "paidBy"::TEXT;
ALTER TABLE "ScheduledDrive" ALTER COLUMN "paidBy" SET DEFAULT 'SELF';

DROP TYPE "PaidBy";

-- Trip: the rest of the fields iOS's `DriveTrip` carries that the server never stored.
ALTER TABLE "Trip"
  ADD COLUMN "endDate" TIMESTAMP(3),
  ADD COLUMN "movingSeconds" INTEGER,
  ADD COLUMN "maxSpeed" DOUBLE PRECISION,
  ADD COLUMN "avgSpeed" DOUBLE PRECISION,
  ADD COLUMN "name" TEXT,
  ADD COLUMN "matchedPolyline" TEXT,
  ADD COLUMN "matchedFraction" DOUBLE PRECISION,
  ADD COLUMN "usedRouteMatching" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "vehicleName" TEXT,
  ADD COLUMN "vehicleMpg" DOUBLE PRECISION,
  ADD COLUMN "estimatedGallons" DOUBLE PRECISION,
  ADD COLUMN "scheduledDeparture" TIMESTAMP(3),
  ADD COLUMN "scheduledArrival" TIMESTAMP(3),
  ADD COLUMN "journeyId" TEXT,
  ADD COLUMN "legIndex" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "legTotal" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isManualEntry" BOOLEAN NOT NULL DEFAULT false;

-- ScheduledDrive: the "canceled just this once" list, previously accepted but discarded.
ALTER TABLE "ScheduledDrive" ADD COLUMN "canceledOccurrences" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[];

-- Vehicle: MPG + last-fill-up date, used for the paid-by fuel-cost breakdowns.
ALTER TABLE "Vehicle"
  ADD COLUMN "avgMpg" DOUBLE PRECISION,
  ADD COLUMN "lastFilledUp" TIMESTAMP(3);

-- Settings: the two fields iOS's `UserSettings` carries that weren't mirrored yet.
ALTER TABLE "Settings"
  ADD COLUMN "fuelPricePerGallon" DOUBLE PRECISION NOT NULL DEFAULT 3.75,
  ADD COLUMN "defaultPaidBy" TEXT NOT NULL DEFAULT 'SELF';

-- CreateTable
CREATE TABLE "TrackPoint" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "t" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION NOT NULL,
    "course" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "altitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "onRoad" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TrackPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayerGroup" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "colorName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PayerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedPlace" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'mappin.circle.fill',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedPlace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackPoint_tripId_idx" ON "TrackPoint"("tripId");

-- CreateIndex
CREATE INDEX "TrackPoint_tripId_seq_idx" ON "TrackPoint"("tripId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "PayerGroup_key_key" ON "PayerGroup"("key");

-- AddForeignKey
ALTER TABLE "TrackPoint" ADD CONSTRAINT "TrackPoint_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
