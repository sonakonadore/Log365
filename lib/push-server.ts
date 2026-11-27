import {
  buildPushPayload,
  type PushSubscription,
  type VapidKeys,
} from "@block65/webcrypto-web-push";
import { minute, reminderDue } from "./reminder-time";
import type { DiaryEvent } from "./diary";

const subject = "https://github.com/sonakonadore/Log365";
const encode = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("base64url");

export async function vapidKeys(db: D1Database) {
  const existing = () =>
    db
      .prepare("SELECT value FROM push_state WHERE name='vapid'")
      .first<string>("value");
  let value = await existing();
  if (!value) {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey))
      .d;
    const publicKey = encode(
      await crypto.subtle.exportKey("raw", pair.publicKey),
    );
    await db
      .prepare("INSERT OR IGNORE INTO push_state(name,value) VALUES('vapid',?)")
      .bind(JSON.stringify({ publicKey, privateKey }))
      .run();
    value = await existing();
  }
  return { ...JSON.parse(value!), subject } as VapidKeys;
}

export function validDevice(sub?: PushSubscription): sub is PushSubscription {
  if (
    !sub ||
    typeof sub.endpoint !== "string" ||
    sub.endpoint.length > 2048 ||
    !sub.keys ||
    !/^[\w-]{22}$/.test(sub.keys.auth) ||
    !/^[\w-]{87}$/.test(sub.keys.p256dh)
  )
    return false;
  try {
    const url = new URL(sub.endpoint);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname.endsWith(".push.apple.com") ||
        url.hostname === "push.apple.com" ||
        url.hostname.endsWith(".push.services.mozilla.com") ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export async function deviceId(endpoint: string) {
  return encode(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)),
  );
}

export async function dispatchReminders(
  db: D1Database,
  source: "worker" | "github",
  now = Date.now(),
) {
  // Heartbeats contain only the last scheduler timestamp.
  await db
    .prepare(
      "INSERT INTO push_state(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
    )
    .bind("tick-" + source, String(now))
    .run();
  const windowStart = now - 15 * minute;
  const { results } = await db
    .prepare(
      `SELECT r.owner,r.id,r.version,r.content FROM diary_records r
    WHERE json_type(r.content,'$.reminder')='object' AND r.owner IN (SELECT owner FROM push_devices)`,
    )
    .all<{ id: string; owner: string; version: number; content: string }>();
  let nextDue = Infinity;
  let keys: VapidKeys | undefined;
  for (const row of results) {
    const event = JSON.parse(row.content) as DiaryEvent;
    if (source === "github") {
      const nextMinute = (Math.floor(now / minute) + 1) * minute;
      const upcoming = reminderDue(event, now + 5 * minute, nextMinute);
      if (upcoming) nextDue = Math.min(nextDue, upcoming.due);
    }
    const match = reminderDue(event, now, Math.max(windowStart, row.version));
    if (!match) continue;
    const { results: devices } = await db
      .prepare(
        "SELECT id,subscription FROM push_devices WHERE owner=? AND created<?",
      )
      .bind(row.owner, match.due + minute)
      .all<{ id: string; subscription: string }>();
    for (const device of devices) {
      const args = [device.id, row.id, match.day];
      const claim = await db
        .prepare(
          `INSERT INTO push_deliveries(device,event,occurrence,lease,due,sent)
        SELECT ?,?,?,?,?,0 WHERE EXISTS(SELECT 1 FROM diary_records WHERE owner=? AND id=? AND version=?)
        AND EXISTS(SELECT 1 FROM push_devices WHERE id=? AND owner=?)
        ON CONFLICT(device,event,occurrence) DO UPDATE SET lease=excluded.lease,due=excluded.due
        WHERE sent=0 AND lease<=?`,
        )
        .bind(
          ...args,
          now + 2 * minute,
          match.due,
          row.owner,
          row.id,
          row.version,
          device.id,
          row.owner,
          now,
        )
        .run();
      if (!claim.meta.changes) continue;
      const sub = JSON.parse(device.subscription) as PushSubscription;
      if (!validDevice(sub)) continue;
      keys ??= await vapidKeys(db);
      const body = match.day + " · " + (event.time || "종일");
      try {
        const request = await buildPushPayload(
          {
            data: {
              title: event.title,
              body,
              day: match.day,
              tag: row.id + "-" + match.day,
            },
            options: { ttl: 300, urgency: "high" },
          },
          sub,
          keys,
        );
        const res = await fetch(sub.endpoint, {
          ...request,
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok)
          await db
            .prepare(
              "UPDATE push_deliveries SET sent=1 WHERE device=? AND event=? AND occurrence=?",
            )
            .bind(...args)
            .run();
        else if (res.status === 404 || res.status === 410)
          await db
            .prepare("DELETE FROM push_devices WHERE id=? AND owner=?")
            .bind(device.id, row.owner)
            .run();
        else console.warn("Push service status", res.status);
      } catch {
        console.warn("Push delivery will retry");
      }
    }
  }
  await db
    .prepare("DELETE FROM push_deliveries WHERE due<?")
    .bind(now - 2 * 86400000)
    .run();
  return Number.isFinite(nextDue)
    ? Math.max(1, Math.ceil((nextDue - Date.now()) / 1000))
    : null;
}
