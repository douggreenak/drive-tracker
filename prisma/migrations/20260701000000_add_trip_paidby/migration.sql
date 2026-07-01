-- Add the "who pays for gas" payer to trips (mirrors the iOS DriveTrip.paidBy). Additive and safe:
-- existing rows default to SELF.
ALTER TABLE "Trip" ADD COLUMN "paidBy" "PaidBy" NOT NULL DEFAULT 'SELF';

-- Index to match the app's paid-by filtering/breakdowns.
CREATE INDEX "Trip_paidBy_idx" ON "Trip"("paidBy");
