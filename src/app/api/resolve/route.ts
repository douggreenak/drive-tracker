import { NextRequest } from "next/server";
import { ApiError, route } from "@/lib/api-input";
import { resolveNames } from "@/lib/context";

// Dry-run of the server-side place resolver: GET /api/resolve?q=Home&q=Fred%20Meyer
export const GET = route(async (request: NextRequest) => {
  const names = request.nextUrl.searchParams.getAll("q").map((s) => s.trim()).filter(Boolean).slice(0, 10);
  if (!names.length) throw new ApiError(400, 'Provide one or more "q" query parameters, e.g. ?q=Home&q=Fred%20Meyer');
  return Response.json({ results: await resolveNames(names) });
});
