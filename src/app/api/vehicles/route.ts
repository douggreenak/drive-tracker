import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET() {
  const vehicles = await prisma.vehicle.findMany({ orderBy: { createdAt: "asc" } });
  return Response.json(vehicles);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "Missing name" }, { status: 400 });
  }
  const vehicle = await prisma.vehicle.create({
    data: {
      name: body.name,
      make: body.make || null,
      model: body.model || null,
      year: body.year != null ? Math.trunc(Number(body.year)) : null,
      tankSize: body.tankSize != null ? Number(body.tankSize) : null,
      avgMpg: body.avgMpg != null ? Number(body.avgMpg) : null,
      lastFilledUp: body.lastFilledUp ? new Date(body.lastFilledUp) : null,
    },
  });
  return Response.json(vehicle, { status: 201 });
}

// Allow-list the editable fields so a client can't mass-assign arbitrary columns; only fields
// present in the body are updated (a partial PATCH must not blank the rest).
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const data: Record<string, unknown> = {};
  if (has("name")) data.name = String(body.name);
  if (has("make")) data.make = body.make ? String(body.make) : null;
  if (has("model")) data.model = body.model ? String(body.model) : null;
  if (has("year")) data.year = body.year != null ? Math.trunc(Number(body.year)) : null;
  if (has("tankSize")) data.tankSize = body.tankSize != null ? Number(body.tankSize) : null;
  if (has("avgMpg")) data.avgMpg = body.avgMpg != null ? Number(body.avgMpg) : null;
  if (has("lastFilledUp")) data.lastFilledUp = body.lastFilledUp ? new Date(body.lastFilledUp) : null;
  try {
    const vehicle = await prisma.vehicle.update({ where: { id }, data });
    return Response.json(vehicle);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json().catch(() => ({ id: null }));
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  await prisma.vehicle.deleteMany({ where: { id } });
  return Response.json({ success: true });
}
