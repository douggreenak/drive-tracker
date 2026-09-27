import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET() {
  const groups = await prisma.payerGroup.findMany({ orderBy: { sortOrder: "asc" } });
  return Response.json(groups);
}

// Upserts by `key` rather than creating unconditionally: the two built-ins ("Me"/"Parents") are
// seeded locally on every iOS install and would otherwise create duplicate server rows every time
// a device re-pushes them.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.key !== "string" || !body.key.trim()) {
    return Response.json({ error: "Missing key" }, { status: 400 });
  }
  const group = await prisma.payerGroup.upsert({
    where: { key: body.key },
    create: {
      key: body.key,
      name: String(body.name ?? body.key),
      icon: String(body.icon ?? "person.fill"),
      colorName: String(body.colorName ?? "blue"),
      sortOrder: Math.trunc(Number(body.sortOrder) || 0),
      isBuiltIn: body.isBuiltIn === true,
      isArchived: body.isArchived === true,
    },
    update: {
      name: String(body.name ?? body.key),
      icon: String(body.icon ?? "person.fill"),
      colorName: String(body.colorName ?? "blue"),
      sortOrder: Math.trunc(Number(body.sortOrder) || 0),
      isArchived: body.isArchived === true,
    },
  });
  return Response.json(group, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const key = body?.key;
  if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const data: Record<string, unknown> = {};
  if (has("name")) data.name = String(body.name);
  if (has("icon")) data.icon = String(body.icon);
  if (has("colorName")) data.colorName = String(body.colorName);
  if (has("sortOrder")) data.sortOrder = Math.trunc(Number(body.sortOrder) || 0);
  if (has("isArchived")) data.isArchived = body.isArchived === true;
  try {
    const group = await prisma.payerGroup.update({ where: { key }, data });
    return Response.json(group);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest) {
  const { key } = await request.json().catch(() => ({ key: null }));
  if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
  await prisma.payerGroup.deleteMany({ where: { key } });
  return Response.json({ success: true });
}
