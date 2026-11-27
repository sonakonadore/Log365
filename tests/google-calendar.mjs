// Isolated in-memory D1 and Google HTTP responses. This test never calls a network service.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { calendarRequest } from "../lib/google/service.ts";
import { scopes } from "../lib/google/auth.ts";
import { displayEvent, projectEvent, windowFor } from "../lib/google/events.ts";

const sql = new DatabaseSync(":memory:");
sql.exec(
  readFileSync(
    new URL("../drizzle/0002_google_calendar_connection.sql", import.meta.url),
    "utf8",
  ),
);
class Statement {
  constructor(sqlText, values = []) {
    this.q = sql.prepare(sqlText);
    this.values = values;
  }
  bind(...values) {
    this.values = values;
    return this;
  }
  first() {
    return this.q.get(...this.values) ?? null;
  }
  run() {
    return { meta: { changes: Number(this.q.run(...this.values).changes) } };
  }
}
const db = {
  prepare: (s) => new Statement(s),
  async batch(stmts) {
    sql.exec("BEGIN");
    try {
      const result = stmts.map((s) => s.run());
      sql.exec("COMMIT");
      return result;
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  },
};
const site = "https://local.example",
  callback = site + "/api/google-calendar/callback",
  calendarId = "fixture@example.test";
const env = {
  DB: db,
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "server-only-fixture",
  GOOGLE_TOKEN_KEY: randomBytes(32).toString("base64"),
  GOOGLE_REDIRECT_URI: callback,
  GOOGLE_CALENDAR_TEST_ID: calendarId,
};
const events = new Map(),
  grants = new Map(),
  calendarPath =
    "/calendar/v3/calendars/" + encodeURIComponent(calendarId) + "/events";
let nextVersion = 1,
  failPatch = false,
  pageCount = 0;
const json = (value, status = 200) => Response.json(value, { status });
const getTime = (b) =>
  b.dateTime && !/(Z|[+-]\d\d:\d\d)$/.test(b.dateTime)
    ? { ...b, dateTime: b.dateTime + "+09:00" }
    : b;
async function google(url, init) {
  assert.equal(
    init.redirect,
    "manual",
    "Workers support manual redirects and credentials must stay on the requested origin",
  );
  const u = new URL(url);
  if (u.origin === "https://oauth2.googleapis.com") {
    assert.equal(u.pathname, "/token");
    const form = init.body;
    assert.equal(form.get("client_secret"), env.GOOGLE_CLIENT_SECRET);
    if (form.get("grant_type") === "refresh_token")
      return json({ access_token: "fixture-access", expires_in: 3600 });
    assert.equal(
      createHash("sha256")
        .update(form.get("code_verifier"))
        .digest("base64url"),
      grants.get(form.get("code")),
    );
    return json({
      refresh_token: "fixture-refresh",
      access_token: "fixture-access",
      expires_in: 3600,
      scope: scopes.join(" "),
    });
  }
  assert.equal(u.origin, "https://www.googleapis.com");
  assert.equal(init.headers.Authorization, "Bearer fixture-access");
  if (u.pathname === "/calendar/v3/users/me/calendarList") {
    assert.equal(env.GOOGLE_CALENDAR_MODE, "live");
    assert.equal(u.searchParams.get("minAccessRole"), "owner");
    return json({
      items: [
        { id: calendarId, summary: "Test only", accessRole: "owner" },
        { id: "shared", summary: "Shared", accessRole: "reader" },
      ],
    });
  }
  if (
    u.pathname ===
    "/calendar/v3/users/me/calendarList/" + encodeURIComponent(calendarId)
  )
    return json({ id: calendarId, summary: "Test only", accessRole: "owner" });
  if (u.pathname === calendarPath && init.method === "GET") {
    const tag = u.searchParams.get("privateExtendedProperty");
    if (env.GOOGLE_CALENDAR_MODE !== "live")
      assert.match(tag, /^log365Test=[a-f0-9]{64}$/);
    assert.equal(u.searchParams.get("singleEvents"), "true");
    pageCount++;
    const visible = [...events.values()].filter(
      (e) =>
        !tag || e.extendedProperties?.private?.log365Test === tag.split("=")[1],
    );
    return u.searchParams.has("pageToken")
      ? json({ items: visible.slice(1) })
      : json({ items: visible.slice(0, 1), nextPageToken: "more" });
  }
  if (u.pathname === calendarPath && init.method === "POST") {
    const data = JSON.parse(init.body);
    assert(!("attendees" in data));
    assert.equal(data.conferenceData, null);
    assert.equal(u.searchParams.get("sendUpdates"), "none");
    if (env.GOOGLE_CALENDAR_MODE !== "live")
      assert.equal(data.reminders.useDefault, false);
    if (events.has(data.id)) return json({}, 409);
    const e = {
      ...data,
      etag: '"' + nextVersion++ + '"',
      start: getTime(data.start),
      end: getTime(data.end),
    };
    events.set(e.id, e);
    return json(e);
  }
  assert(u.pathname.startsWith(calendarPath + "/"));
  const id = u.pathname.slice(calendarPath.length + 1),
    e = events.get(id);
  if (!e) return json({}, 404);
  if (init.method === "GET") return json(e);
  assert.equal(init.headers["If-Match"], e.etag);
  assert.equal(u.searchParams.get("sendUpdates"), "none");
  if (init.method === "DELETE") {
    events.delete(id);
    return new Response(null, { status: 204 });
  }
  assert.equal(init.method, "PATCH");
  if (failPatch) return json({}, 412);
  const patch = JSON.parse(init.body);
  assert(!("attendees" in patch));
  assert(!("conferenceData" in patch));
  for (const k of ["start", "end"])
    if (patch[k]) {
      const merged = { ...e[k], ...patch[k] };
      for (const key of Object.keys(merged))
        if (merged[key] === null) delete merged[key];
      assert.notEqual(Boolean(merged.date), Boolean(merged.dateTime));
      patch[k] = getTime(merged);
    }
  Object.assign(e, patch, { etag: '"' + nextVersion++ + '"' });
  return json(e);
}
const req = (owner, op, data) =>
  calendarRequest(
    new Request(
      site + "/api/google-calendar" + (data ? "" : op),
      data
        ? {
            method: "POST",
            headers: { "content-type": "application/json", origin: site },
            body: JSON.stringify({ op, ...data }),
          }
        : {},
    ),
    env,
    owner,
    google,
  );
const val = async (r) => {
  const res = await r;
  assert(res.ok, "unexpected status " + res.status);
  return res.json();
};
const back = (owner, url, cookie) =>
  calendarRequest(
    new Request(url, { headers: { cookie } }),
    env,
    owner,
    google,
  );
async function authorize(owner) {
  const result = await req(owner, "connect", {}),
    cookie = result.headers.get("set-cookie").split(";")[0];
  const { url } = await val(result),
    u = new URL(url);
  assert.equal(u.searchParams.get("scope"), scopes.join(" "));
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert(!url.includes("server-only-fixture"));
  const code = randomBytes(16).toString("hex");
  grants.set(code, u.searchParams.get("code_challenge"));
  const c =
    callback +
    "?" +
    new URLSearchParams({ code, state: u.searchParams.get("state") });
  assert.equal(
    (await back("different-user", c, cookie)).headers.get("location"),
    "/?google=session",
  );
  assert.equal(
    (await back(owner, c, "")).headers.get("location"),
    "/?google=session",
  );
  assert.equal(
    (await back(owner, c, cookie)).headers.get("location"),
    "/?google=connected",
  );
  assert.equal(
    (await back(owner, c, cookie)).headers.get("location"),
    "/?google=session",
  );
  return val(req(owner, "?op=state"));
}
assert.equal((await req(null, "?op=state")).status, 401);
assert.equal(
  (
    await calendarRequest(
      new Request(site + "/api/google-calendar", {
        method: "POST",
        headers: {
          origin: "https://other.example",
          "content-type": "application/json",
        },
        body: '{"op":"connect"}',
      }),
      env,
      "owner",
      google,
    )
  ).status,
  403,
);
assert.equal((await val(req("owner", "?op=state"))).connected, false);
let state = await authorize("owner");
assert.deepEqual(await val(req("owner", "?op=calendars")), [
  { id: calendarId, name: "Test only" },
]);
assert.equal(
  (
    await req("owner", "select", {
      generation: state.generation,
      calendarId: "other",
    })
  ).status,
  409,
);
await val(req("owner", "select", { generation: state.generation, calendarId }));
state = await val(req("owner", "?op=state"));
let target = { generation: state.generation, calendarId };
const encrypted = sql
  .prepare("select tokens from google_calendar_links")
  .get().tokens;
assert(
  !encrypted.includes("fixture-access") &&
    !encrypted.includes("fixture-refresh"),
);
const fields = {
  day: "2026-12-31",
  endDay: "2027-01-01",
  allDay: false,
  start: "23:30",
  end: "00:00",
  title: "Log365 연동 테스트",
};
const create = (draft, requestId = "c".repeat(32)) =>
  req("owner", "create", { ...target, draft, requestId });
const timed = await val(create(fields));
assert.equal(events.size, 1);
assert.equal(displayEvent(timed).data.endDay, "2026-12-31");
assert.equal((await create(fields)).status, 409);
const allDay = await val(
  create({ ...fields, day: "2028-02-29", endDay: "2028-03-01", allDay: true }),
);
assert.deepEqual(events.get(allDay.eventId).end, { date: "2028-03-02" });
assert.equal(allDay.day, "2028-02-29");
assert.equal(allDay.endDay, "2028-03-01");
assert.equal(events.size, 2);
assert.equal(
  (await create({ ...fields, allDay: true }, "d".repeat(32))).status,
  409,
);
const january = windowFor("2027-01");
assert.match(january.timeMin, /T00:00:00\+09:00$/);
const list =
  "?" + new URLSearchParams({ op: "events", month: "2027-01", calendarId });
assert.equal((await val(req("owner", list))).length, 2);
assert(pageCount >= 2);
assert.equal((await req("stranger", list)).status, 409);
assert.equal(
  (
    await req("stranger", "delete", {
      ...target,
      eventId: timed.eventId,
      etag: timed.etag,
    })
  ).status,
  409,
);
const change = (op, event, draft = fields) =>
  req("owner", op, {
    ...target,
    eventId: event.eventId,
    etag: event.etag,
    draft,
  });
assert.equal(
  (await change("delete", { ...timed, eventId: "unrelated" })).status,
  400,
);
let current = await val(change("update", timed, { ...fields, start: "22:15" }));
assert.equal(current.eventId, timed.eventId);
assert.equal(current.start, "22:15");
assert.equal((await change("delete", timed)).status, 412);
failPatch = true;
assert.equal(
  (await change("update", current, { ...fields, start: "21:30" })).status,
  412,
);
failPatch = false;
const raw = events.get(current.eventId);
for (const [key, value] of [
  ["attendees", [{ email: "someone@example.test" }]],
  ["recurringEventId", "series"],
  ["recurrence", ["RRULE:FREQ=WEEKLY"]],
  ["attendeesOmitted", true],
  ["locked", true],
]) {
  raw[key] = value;
  assert(projectEvent(calendarId, raw).readOnly);
  assert.equal((await change("update", current)).status, 403);
  assert.equal((await change("delete", current)).status, 403);
  delete raw[key];
}
raw.start = { dateTime: "2026-12-31T15:30:00Z" };
assert.equal(projectEvent(calendarId, raw).day, "2027-01-01");
assert.equal(projectEvent(calendarId, raw).start, "00:30");
await val(req("owner", "disconnect", target));
assert.equal(events.size, 2);
assert.equal((await req("owner", list)).status, 409);
state = await authorize("owner");
await val(req("owner", "select", { generation: state.generation, calendarId }));
assert.equal((await change("delete", current)).status, 409);
state = await val(req("owner", "?op=state"));
target = { calendarId, generation: state.generation };
events.delete(allDay.eventId);
assert.deepEqual(
  (await val(req("owner", list))).map((e) => e.eventId),
  [current.eventId],
);
await val(change("delete", current));
assert.equal(events.size, 0);
env.GOOGLE_CALENDAR_MODE = "live";
assert.deepEqual(await val(req("owner", "?op=calendars")), [
  { id: calendarId, name: "Test only" },
]);
const live = await val(create({ ...fields, title: "Local fixture" }));
assert.equal(live.eventId, "365" + "c".repeat(32));
const dayOnly = await val(change("update", live, { ...fields, allDay: true }));
assert.deepEqual(events.get(dayOnly.eventId).start, { date: fields.day });
const restored = await val(change("update", dayOnly, fields));
assert.equal(restored.start, "23:30");
assert.equal(restored.endDay, fields.endDay);
assert.equal(
  (await change("update", restored, { ...fields, start: ["22:30"] })).status,
  400,
);
assert.equal((await create(fields)).status, 409);
await val(change("delete", restored));
assert.equal(events.size, 0);
console.log(
  "PASS: owner isolation, consent/PKCE and replay, ciphertext, bounded test slots, idempotency, paging, Seoul and all-day boundaries, provider edits/deletes, ETag conflicts, read-only guards and unlink preservation.",
);
