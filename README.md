This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## API & MCP

**REST API** (`/api/*`, described at `GET /api/openapi`): authenticate with the shared `API_KEY` as
`x-api-key: <key>` or `Authorization: Bearer <key>` (a browser session cookie also works).

**MCP server** (`POST /mcp`, Streamable HTTP, stateless) uses a *separate* credential: a signed
token valid for 5 years, verified with `MCP_TOKEN_SECRET` (set in Vercel). `API_KEY` does not work
on `/mcp`, and MCP tokens do not work on `/api/*`.

```bash
MCP_TOKEN_SECRET=<secret> npm run mcp:token        # mint a 5-year token (optionally: -- <days>)
claude mcp add --transport http drive-tracker https://<your-domain>/mcp \
  --header "Authorization: Bearer <token>"
```

Tools: `get_stats`, `list_trips`, `get_trip`, `log_trip`, `update_trip`, `list_gas_entries`,
`add_gas_entry`, `list_vehicles`, `list_scheduled_drives`, `list_saved_places`,
`list_payer_groups`, `get_settings`. There is deliberately no delete tool. Rotating
`MCP_TOKEN_SECRET` revokes all tokens.

### Creating a scheduled drive (`POST /api/scheduled`)

The body may be the object, the object wrapped in one field (`{"scheduled": {...}}`), or either
JSON-encoded as a string. snake_case and camelCase keys both work.

```bash
curl -X POST https://<your-domain>/api/scheduled -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"date":"2026-11-26","departure_time":"11:18 AM","start":"Current location","stops":["Fred Meyer"],"end":"Home","notes":"Round trip"}'
```

Required: a departure (`departure` ISO 8601, or `date` + `departure_time` as `11:18` / `11:18 AM`) and a
destination (`end`, or at least one stop). Everything else has defaults. Offset-less times are read in the
body's `timezone` (IANA name) or the `APP_TIMEZONE` env var, else America/Anchorage. Errors are JSON:
`400` malformed body, `401` auth, `404` unknown id, `422` `{error, details:[{field,message}]}`.

Tests: `npm test` (Node's built-in runner, no extra dependencies).

### Assistant-friendly API (no guessing)

`GET /api/context` returns timezone, defaults (payer, vehicle, home), saved places, vehicles, payer
groups, recent addresses/trips and upcoming scheduled drives. `GET /api/resolve?q=Home&q=Fred%20Meyer`
dry-runs the resolver. `POST /api/scheduled` and `POST /api/trips` resolve place names against saved
places and recently used addresses (no geocoder is used), default `paidBy`/`vehicle`, and return
`422 {error, field, unresolved, hint, suggestions}` for anything they can't resolve. Server env:
`APP_TIMEZONE` (IANA zone) and optionally `DEFAULT_VEHICLE`. MCP tools: `get_context`,
`resolve_places`, `create_scheduled_drive`, `log_trip`.
