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
