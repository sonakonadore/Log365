import {
  CalendarError,
  connectionMessages,
  type ConnectionResult,
} from "./events.ts";

export class ConsentError extends CalendarError {
  readonly reason: ConnectionResult;
  constructor(reason: ConnectionResult, status: number) {
    super(status, connectionMessages[reason]);
    this.reason = reason;
  }
}

export const scopes = [
  "calendar.calendarlist.readonly",
  "calendar.events.owned",
].map((s) => "https://www.googleapis.com/auth/" + s);
export type CalendarEnv = {
  DB?: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_TOKEN_KEY?: string;
  GOOGLE_REDIRECT_URI?: string;
  GOOGLE_CALENDAR_TEST_ID?: string;
  GOOGLE_CALENDAR_MODE?: string;
};
export type Grant = { refresh: string; access: string; expires: number };
export type Link = {
  owner: string;
  generation: string;
  tokens: string;
  calendar: string | null;
};
const encode = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const decode = (s: string) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
const utf = new TextEncoder();
export async function digest(s: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", utf.encode(s)));
}
export const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
export function configured(e: CalendarEnv) {
  if (
    !e.DB ||
    !e.GOOGLE_CLIENT_ID ||
    !e.GOOGLE_CLIENT_SECRET ||
    !e.GOOGLE_TOKEN_KEY ||
    !e.GOOGLE_REDIRECT_URI ||
    (e.GOOGLE_CALENDAR_MODE !== "live" && !e.GOOGLE_CALENDAR_TEST_ID)
  )
    return false;
  try {
    const u = new URL(e.GOOGLE_REDIRECT_URI);
    return (
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password &&
      u.pathname === "/api/google-calendar/callback" &&
      (u.protocol === "https:" ||
        (u.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(u.hostname))) &&
      decode(e.GOOGLE_TOKEN_KEY).byteLength === 32
    );
  } catch {
    return false;
  }
}
async function key(e: CalendarEnv) {
  return crypto.subtle.importKey(
    "raw",
    decode(e.GOOGLE_TOKEN_KEY!),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(e: CalendarEnv, owner: string, grant: Grant) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf.encode(owner) },
    await key(e),
    utf.encode(JSON.stringify(grant)),
  );
  return encode(iv) + "." + encode(new Uint8Array(encrypted));
}
async function openGrant(e: CalendarEnv, link: Link): Promise<Grant> {
  const [iv, data] = link.tokens.split(".");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(iv), additionalData: utf.encode(link.owner) },
    await key(e),
    decode(data),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
export const getLink = (e: CalendarEnv, owner: string) =>
  e
    .DB!.prepare("SELECT * FROM google_calendar_links WHERE owner=?")
    .bind(owner)
    .first<Link>();
export async function begin(e: CalendarEnv, owner: string, nonce: string) {
  const state = encode(crypto.getRandomValues(new Uint8Array(32))),
    verifier = encode(crypto.getRandomValues(new Uint8Array(48)));
  await e
    .DB!.prepare(
      "INSERT OR REPLACE INTO google_calendar_states(owner,digest,verifier,expires) VALUES(?,?,?,?)",
    )
    .bind(
      owner,
      hex(await digest(state + "." + nonce)),
      verifier,
      Date.now() + 600000,
    )
    .run();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID!,
    redirect_uri: e.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent select_account",
    state,
    code_challenge: encode(await digest(verifier)),
    code_challenge_method: "S256",
  }).toString();
  return url.href;
}
async function exchange(
  e: CalendarEnv,
  fields: Record<string, string>,
  http: typeof fetch,
) {
  const r = await http("https://oauth2.googleapis.com/token", {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: e.GOOGLE_CLIENT_ID!,
      client_secret: e.GOOGLE_CLIENT_SECRET!,
      ...fields,
    }),
  }).catch(() => {
    throw new ConsentError("network", 502);
  });
  if (!r.ok)
    throw new ConsentError(
      r.status >= 500 ? "network" : "grant",
      r.status === 400 ? 401 : 502,
    );
  const t = (await r.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  if (!t.access_token || !Number.isFinite(t.expires_in))
    throw new CalendarError(502, "Google 인증 결과를 확인할 수 없어요.");
  return t;
}
export async function finish(
  e: CalendarEnv,
  owner: string,
  params: URLSearchParams,
  nonce: string,
  http: typeof fetch,
) {
  const state = params.get("state") ?? "";
  if (!/^[\w-]{43}$/.test(state) || !nonce)
    throw new ConsentError("session", 400);
  const stateHash = hex(await digest(state + "." + nonce));
  const row = await e
    .DB!.prepare(
      "SELECT verifier FROM google_calendar_states WHERE owner=? AND digest=? AND expires>?",
    )
    .bind(owner, stateHash, Date.now())
    .first<{ verifier: string }>();
  const code = params.get("code");
  if (!row) throw new ConsentError("session", 400);
  if (params.get("error") === "access_denied")
    throw new ConsentError("denied", 403);
  if (!code || params.has("error")) throw new ConsentError("grant", 400);
  const t = await exchange(
    e,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: e.GOOGLE_REDIRECT_URI!,
      code_verifier: row.verifier,
    },
    http,
  );
  if (!scopes.every((s) => t.scope?.split(" ").includes(s)))
    throw new ConsentError("permissions", 403);
  if (!t.refresh_token) throw new ConsentError("offline", 403);
  const encrypted = await seal(e, owner, {
    access: t.access_token!,
    refresh: t.refresh_token,
    expires: Date.now() + 1000 * t.expires_in,
  });
  // Consume the account-bound challenge and install the grant in one transaction.
  // A disconnect or a newer consent request invalidates an in-flight exchange.
  const [write] = await e.DB!.batch([
    e
      .DB!.prepare(
        "INSERT OR REPLACE INTO google_calendar_links(owner,generation,tokens,calendar) SELECT owner,?,?,NULL FROM google_calendar_states WHERE owner=? AND digest=? AND expires>?",
      )
      .bind(crypto.randomUUID(), encrypted, owner, stateHash, Date.now()),
    e
      .DB!.prepare(
        "DELETE FROM google_calendar_states WHERE owner=? AND digest=?",
      )
      .bind(owner, stateHash),
  ]);
  if (!write.meta.changes)
    throw new CalendarError(409, "연결 요청이 만료되었어요.");
}
export async function token(e: CalendarEnv, link: Link, http: typeof fetch) {
  const grant = await openGrant(e, link);
  if (grant.expires > Date.now() + 60000) return grant.access;
  const t = await exchange(
    e,
    { grant_type: "refresh_token", refresh_token: grant.refresh },
    http,
  );
  const encrypted = await seal(e, link.owner, {
    access: t.access_token!,
    refresh: t.refresh_token ?? grant.refresh,
    expires: Date.now() + 1000 * t.expires_in,
  });
  await e
    .DB!.prepare(
      "UPDATE google_calendar_links SET tokens=? WHERE owner=? AND generation=? AND tokens=?",
    )
    .bind(encrypted, link.owner, link.generation, link.tokens)
    .run();
  return t.access_token!;
}
