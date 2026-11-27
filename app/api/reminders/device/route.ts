import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { deviceId, validDevice, vapidKeys } from "../../../../lib/push-server";

export const dynamic = "force-dynamic";
const reply = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return reply({}, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({}, 415);
  const origin = request.headers.get("origin");
  if (
    origin &&
    new URL(origin).host !== new URL(request.url).host &&
    new URL(origin).host !== request.headers.get("host")
  )
    return reply({}, 403);
  const data = (await request.json().catch(() => null)) as {
    action?: string;
    subscription?: import("@block65/webcrypto-web-push").PushSubscription;
  } | null;
  const db = env.DB!;
  if (data?.action === "key")
    return reply({ publicKey: (await vapidKeys(db)).publicKey });
  const sub = data?.subscription;
  if (!validDevice(sub)) return reply({}, 400);
  const id = await deviceId(sub.endpoint);
  if (data?.action === "status")
    return reply({
      active: !!(await db
        .prepare("SELECT 1 FROM push_devices WHERE id=? AND owner=?")
        .bind(id, user.userId)
        .first()),
    });
  if (data?.action === "remove") {
    await db
      .prepare("DELETE FROM push_devices WHERE id=? AND owner=?")
      .bind(id, user.userId)
      .run();
    return reply({ active: false });
  }
  if (data?.action !== "add") return reply({}, 400);
  try {
    await crypto.subtle.importKey(
      "raw",
      Buffer.from(sub.keys.p256dh, "base64url"),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
  } catch {
    return reply({}, 400);
  }
  const value = JSON.stringify({
    endpoint: sub.endpoint,
    keys: { auth: sub.keys.auth, p256dh: sub.keys.p256dh },
    expirationTime: null,
  });
  await db
    .prepare(
      "INSERT INTO push_devices(id,owner,subscription,created) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET subscription=excluded.subscription WHERE owner=excluded.owner",
    )
    .bind(id, user.userId, value, Date.now())
    .run();
  const own = await db
    .prepare("SELECT 1 FROM push_devices WHERE id=? AND owner=?")
    .bind(id, user.userId)
    .first();
  return own ? reply({ active: true }) : reply({}, 409);
}
