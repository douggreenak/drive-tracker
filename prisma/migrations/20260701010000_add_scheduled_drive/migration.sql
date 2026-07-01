-- Scheduled drives, mirrored from iOS.

-- CreateEnum
CREATE TYPE "RepeatRule" AS ENUM ('NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY');

-- CreateTable
CREATE TABLE "ScheduledDrive" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startAddress" TEXT NOT NULL,
    "endAddress" TEXT NOT NULL,
    "startLat" DOUBLE PRECISION NOT NULL,
    "startLng" DOUBLE PRECISION NOT NULL,
    "endLat" DOUBLE PRECISION NOT NULL,
    "endLng" DOUBLE PRECISION NOT NULL,
    "departure" TIMESTAMP(3) NOT NULL,
    "estimatedTravelTime" INTEGER NOT NULL,
    "scheduledArrival" TIMESTAMP(3) NOT NULL,
    "repeatRule" "RepeatRule" NOT NULL DEFAULT 'NONE',
    "category" "TripCategory" NOT NULL DEFAULT 'COMMUTE',
    "paidBy" "PaidBy" NOT NULL DEFAULT 'SELF',
    "vehicleName" TEXT,
    "notes" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isCanceled" BOOLEAN NOT NULL DEFAULT false,
    "lastStartedAt" TIMESTAMP(3),
    "lastCompletedAt" TIMESTAMP(3),
    "skippedOccurrences" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledDrive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledDrive_departure_idx" ON "ScheduledDrive"("departure");

-- CreateIndex
CREATE INDEX "ScheduledDrive_isCanceled_idx" ON "ScheduledDrive"("isCanceled");
