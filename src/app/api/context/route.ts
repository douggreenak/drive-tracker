import { route } from "@/lib/api-input";
import { buildContext } from "@/lib/context";

// One small read-only payload with everything an assistant needs before logging or scheduling a
// drive: defaults, saved places, vehicles, payer groups, recent addresses/trips, upcoming drives.
export const GET = route(async () => Response.json(await buildContext()));
