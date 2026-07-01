import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET() {
  // The two reads are independent — run them concurrently.
  const [existing, vehicles] = await Promise.all([
    prisma.settings.findFirst(),
    prisma.vehicle.findMany(),
  ]);
  const settings = existing ?? (await prisma.settings.create({ data: {} }));
  return Response.json({ settings, vehicles });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  let settings = await prisma.settings.findFirst();
  if (settings) {
    settings = await prisma.settings.update({
      where: { id: settings.id },
      data: {
        monthlyBudget: body.monthlyBudget ?? settings.monthlyBudget,
        distanceUnit: body.distanceUnit ?? settings.distanceUnit,
        currency: body.currency ?? settings.currency,
        theme: body.theme ?? settings.theme,
      },
    });
  } else {
    // Allow-list the editable fields (matching the update branch) so a client can't seed the
    // singleton settings row with a chosen primary key or arbitrary columns via mass-assignment.
    settings = await prisma.settings.create({
      data: {
        monthlyBudget: body.monthlyBudget ?? undefined,
        distanceUnit: body.distanceUnit ?? undefined,
        currency: body.currency ?? undefined,
        theme: body.theme ?? undefined,
      },
    });
  }
  return Response.json(settings);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (body.vehicle) {
    const vehicle = await prisma.vehicle.create({
      data: {
        name: body.vehicle.name,
        make: body.vehicle.make || null,
        model: body.vehicle.model || null,
        year: body.vehicle.year || null,
        tankSize: body.vehicle.tankSize || null,
      },
    });
    return Response.json(vehicle, { status: 201 });
  }
  return Response.json({ error: "Invalid request" }, { status: 400 });
}
