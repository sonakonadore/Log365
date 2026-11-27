import { env } from "cloudflare:workers";
export const dynamic = "force-dynamic";
export async function GET() {
  const tick = await env
    .DB!.prepare(
      "SELECT MAX(CAST(value AS INTEGER)) AS last FROM push_state WHERE name IN ('tick-worker','tick-github')",
    )
    .first<number>("last");
  return Response.json(
    { lastDispatch: tick ? new Date(tick).toISOString() : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
