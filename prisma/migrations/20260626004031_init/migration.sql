-- CreateEnum
CREATE TYPE "PaidBy" AS ENUM ('SELF', 'PARENTS');

-- CreateEnum
CREATE TYPE "TripCategory" AS ENUM ('COMMUTE', 'ERRAND', 'ROAD_TRIP', 'SCHOOL', 'WORK', 'LEISURE', 'OTHER');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('REGULAR', 'MIDGRADE', 'PREMIUM', 'DIESEL');

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startAddress" TEXT NOT NULL,
    "endAddress" TEXT NOT NULL,
    "startLat" DOUBLE PRECISION NOT NULL,
    "startLng" DOUBLE PRECISION NOT NULL,
    "endLat" DOUBLE PRECISION NOT NULL,
    "endLng" DOUBLE PRECISION NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "duration" INTEGER NOT NULL,
    "notes" TEXT,
    "routeEncoded" TEXT,
    "category" "TripCategory" NOT NULL DEFAULT 'OTHER',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GasEntry" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gallons" DOUBLE PRECISION NOT NULL,
    "pricePerGallon" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "paidBy" "PaidBy" NOT NULL,
    "fuelType" "FuelType" NOT NULL DEFAULT 'REGULAR',
    "stationName" TEXT,
    "odometer" DOUBLE PRECISION,
    "tripId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GasEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "tankSize" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "monthlyBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "distanceUnit" TEXT NOT NULL DEFAULT 'miles',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "theme" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GasEntry" ADD CONSTRAINT "GasEntry_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
