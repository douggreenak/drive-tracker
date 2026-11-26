// Minimal in-memory stand-in for the Prisma client: just the calls lib/context.ts makes.
type Row = Record<string, unknown>;
const table = (defaults: () => Row) => {
  const rows: Row[] = [];
  let n = 0;
  return {
    rows,
    findMany: async (args: { where?: Row; take?: number } = {}) => rows.slice(0, args.take ?? rows.length).map((r) => ({ ...r })),
    findFirst: async () => (rows[0] ? { ...rows[0] } : null),
    findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
    create: async ({ data }: { data: Row }) => {
      const row = { id: `id${++n}`, createdAt: new Date(), updatedAt: new Date(), ...defaults(), ...data };
      rows.push(row);
      return { ...row };
    },
  };
};
export const prisma = {
  savedPlace: table(() => ({ icon: "mappin.circle.fill", sortOrder: 0 })),
  vehicle: table(() => ({ make: null, model: null, year: null, tankSize: null, avgMpg: null })),
  payerGroup: table(() => ({ isArchived: false, isBuiltIn: false, sortOrder: 0 })),
  settings: table(() => ({ defaultPaidBy: "SELF", currency: "USD", distanceUnit: "miles", fuelPricePerGallon: 3.75 })),
  trip: table(() => ({ isFavorite: false })),
  scheduledDrive: table(() => ({ isEnabled: true, isCanceled: false })),
};
export function resetDb() {
  for (const t of Object.values(prisma)) t.rows.length = 0;
}
