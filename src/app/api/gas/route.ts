import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const paidBy = searchParams.get("paidBy");
  const fuelType = searchParams.get("fuelType");
  const sort = searchParams.get("sort") || "date";
  const order = searchParams.get("order") || "desc";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = {};
  if (paidBy) where.paidBy = paidBy;
  if (fuelType) where.fuelType = fuelType;
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }

  const orderBy: Record<string, string> = {};
  if (sort === "cost") orderBy.totalCost = order;
  else if (sort === "gallons") orderBy.gallons = order;
  else orderBy.date = order;

  const gasEntries = await prisma.gasEntry.findMany({
    where,
    // The gas page only shows the linked trip's endpoints — avoid pulling the
    // whole Trip row (including its large routeEncoded column) per entry.
    include: { trip: { select: { startAddress: true, endAddress: true } } },
    orderBy,
  });
  return Response.json(gasEntries);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const entry = await prisma.gasEntry.create({
    data: {
      date: new Date(body.date),
      gallons: body.gallons,
      pricePerGallon: body.pricePerGallon,
      totalCost: body.gallons * body.pricePerGallon,
      paidBy: body.paidBy,
      fuelType: body.fuelType || "REGULAR",
      stationName: body.stationName || null,
      odometer: body.odometer || null,
      vehicleName: body.vehicleName || null,
      tripId: body.tripId || null,
    },
  });
  return Response.json(entry, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  if (typeof body.id !== "string" || !body.id) {
    return Response.json({ error: "Missing id" }, { status: 400 });
  }
  const existing = await prisma.gasEntry.findUnique({ where: { id: body.id } });
  if (!existing) return Response.json({ error: "Gas entry not found" }, { status: 404 });

  const gallons = body.gallons === undefined ? existing.gallons : Number(body.gallons);
  const pricePerGallon = body.pricePerGallon === undefined ? existing.pricePerGallon : Number(body.pricePerGallon);
  if (!Number.isFinite(gallons) || gallons <= 0 || !Number.isFinite(pricePerGallon) || pricePerGallon <= 0) {
    return Response.json({ error: "Gallons and price must be greater than zero" }, { status: 400 });
  }
  if (body.date !== undefined && (typeof body.date !== "string" || !Number.isFinite(Date.parse(body.date)))) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }
  if (body.paidBy !== undefined && body.paidBy !== "SELF" && body.paidBy !== "PARENTS") {
    return Response.json({ error: "Invalid payer" }, { status: 400 });
  }
  const fuelTypes = ["REGULAR", "MIDGRADE", "PREMIUM", "DIESEL"];
  if (body.fuelType !== undefined && !fuelTypes.includes(body.fuelType)) {
    return Response.json({ error: "Invalid fuel type" }, { status: 400 });
  }

  const data = {
    ...(body.date !== undefined ? { date: new Date(body.date) } : {}),
    ...(body.gallons !== undefined ? { gallons } : {}),
    ...(body.pricePerGallon !== undefined ? { pricePerGallon } : {}),
    ...(body.paidBy !== undefined ? { paidBy: body.paidBy } : {}),
    ...(body.fuelType !== undefined ? { fuelType: body.fuelType } : {}),
    ...(body.stationName !== undefined ? { stationName: body.stationName ? String(body.stationName) : null } : {}),
    ...(body.odometer !== undefined ? { odometer: body.odometer === null || body.odometer === "" ? null : Number(body.odometer) } : {}),
    totalCost: gallons * pricePerGallon,
  };
  if (data.odometer !== undefined && data.odometer !== null && (!Number.isFinite(data.odometer) || data.odometer < 0)) {
    return Response.json({ error: "Invalid odometer" }, { status: 400 });
  }
  const entry = await prisma.gasEntry.update({ where: { id: body.id }, data });
  return Response.json(entry);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.gasEntry.delete({ where: { id } });
  return Response.json({ success: true });
}
