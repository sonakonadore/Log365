import { env } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { dispatchReminders } from "../../../../lib/push-server";

const issuer = "https://token.actions.githubusercontent.com";
const audience = "urn:log365:reminder-dispatch";
const keys = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks"));
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return new Response(null, { status: 401 });
  try {
    const { payload } = await jwtVerify(auth.slice(7), keys, {
      issuer,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "nbf"],
    });
    if (
      payload.repository_id !== "1473120624" ||
      payload.repository_owner_id !== "312106218" ||
      payload.workflow_ref !==
        "sonakonadore/Log365/.github/workflows/reminders.yml@refs/heads/main" ||
      payload.ref !== "refs/heads/main" ||
      !["schedule", "workflow_dispatch", "push"].includes(
        String(payload.event_name),
      )
    )
      return new Response(null, { status: 403 });
  } catch {
    return new Response(null, { status: 401 });
  }
  const db = env.DB!;
  const native = await db
    .prepare("SELECT value FROM push_state WHERE name='tick-worker'")
    .first<string>("value");
  const nextSeconds =
    native && Number(native) > Date.now() - 90000
      ? null
      : await dispatchReminders(db, "github");
  return Response.json(
    { nextSeconds },
    { headers: { "Cache-Control": "no-store" } },
  );
}
