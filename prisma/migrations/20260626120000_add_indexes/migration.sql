-- Indexes backing the filter/sort/groupBy patterns used by the API routes
-- (trips by date/category/isFavorite, gas by date/paidBy, and the trip relation).

-- CreateIndex
CREATE INDEX "Trip_date_idx" ON "Trip"("date");

-- CreateIndex
CREATE INDEX "Trip_category_idx" ON "Trip"("category");

-- CreateIndex
CREATE INDEX "Trip_isFavorite_idx" ON "Trip"("isFavorite");

-- CreateIndex
CREATE INDEX "GasEntry_date_idx" ON "GasEntry"("date");

-- CreateIndex
CREATE INDEX "GasEntry_paidBy_idx" ON "GasEntry"("paidBy");

-- CreateIndex
CREATE INDEX "GasEntry_tripId_idx" ON "GasEntry"("tripId");
