import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET() {
  const places = await prisma.savedPlace.findMany({ orderBy: { sortOrder: "asc" } });
  return Response.json(places);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.label !== "string" || typeof body.address !== "string") {
    return Response.json({ error: "Missing label or address" }, { status: 400 });
  }
  const place = await prisma.savedPlace.create({
    data: {
      label: body.label,
      address: body.address,
      lat: Number(body.lat) || 0,
      lng: Number(body.lng) || 0,
      icon: body.icon ? String(body.icon) : "mappin.circle.fill",
      sortOrder: Math.trunc(Number(body.sortOrder) || 0),
    },
  });
  return Response.json(place, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const data: Record<string, unknown> = {};
  if (has("label")) data.label = String(body.label);
  if (has("address")) data.address = String(body.address);
  if (has("lat")) data.lat = Number(body.lat) || 0;
  if (has("lng")) data.lng = Number(body.lng) || 0;
  if (has("icon")) data.icon = String(body.icon);
  if (has("sortOrder")) data.sortOrder = Math.trunc(Number(body.sortOrder) || 0);
  try {
    const place = await prisma.savedPlace.update({ where: { id }, data });
    return Response.json(place);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json().catch(() => ({ id: null }));
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  await prisma.savedPlace.deleteMany({ where: { id } });
  return Response.json({ success: true });
}
