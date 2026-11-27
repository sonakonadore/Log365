import {
  begin,
  ConsentError,
  configured,
  digest,
  finish,
  getLink,
  hex,
  token,
  type CalendarEnv,
  type Link,
} from "./auth.ts";
import {
  CalendarError,
  eventBody,
  projectEvent,
  windowFor,
  zone,
  type EventFields,
  type WireEvent,
} from "./events.ts";

const root = "https://www.googleapis.com/calendar/v3";
const eventFields =
  "id,etag,summary,status,start,end,endTimeUnspecified,recurrence,recurringEventId,attendees(responseStatus),attendeesOmitted,organizer(self),locked,eventType,extendedProperties/private";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
const json = (x: unknown, status = 200) =>
  Response.json(x, { status, headers });
type Target = { id: string; summary: string; accessRole: string };
const permitted = (e: CalendarEnv, id: string) =>
  e.GOOGLE_CALENDAR_MODE === "live" || id === e.GOOGLE_CALENDAR_TEST_ID;
const noTarget = () =>
  new CalendarError(409, "연결된 캘린더가 바뀌었어요. 새로고침해 주세요.");
type Input = {
  op: string;
  generation?: string;
  calendarId?: string;
  eventId?: string;
  etag?: string;
  draft?: EventFields;
  requestId?: string;
};

function googleClient(access: string, http: typeof fetch) {
  return async function call<T>(
    path: string,
    params: Record<string, string>,
    method = "GET",
    body?: unknown,
    etag?: string,
  ): Promise<T> {
    const response = await http(
      root + path + "?" + new URLSearchParams(params),
      {
        method,
        redirect: "manual",
        headers: {
          Authorization: "Bearer " + access,
          "Content-Type": "application/json",
          ...(etag ? { "If-Match": etag } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: "Google 설정에서 계정을 다시 연결해 주세요.",
        403: "Google에서 이 작업을 허용하지 않았어요.",
        404: "Google에서 일정을 찾을 수 없어요. 새로고침해 주세요.",
        410: "이미 삭제된 일정이에요. 새로고침해 주세요.",
        409: "이미 사용한 일정 ID예요. 새로고침해서 Google 원본을 확인해 주세요.",
        412: "다른 앱에서 일정이 바뀌었어요. 새로고침한 뒤 다시 열어 주세요.",
        429: "Google 요청이 많아요. 잠시 뒤 새로고침해 주세요.",
      };
      throw new CalendarError(
        messages[response.status] ? response.status : 502,
        messages[response.status] ??
          "Google의 처리 결과를 확인할 수 없어요. 새로고침해 주세요.",
      );
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  };
}
type Client = ReturnType<typeof googleClient>;
async function pages<T>(
  call: Client,
  path: string,
  params: Record<string, string>,
) {
  const items: T[] = [];
  const seen = new Set<string>();
  let pageToken = "";
  for (let n = 0; n < 100; n++) {
    const page = await call<{ items?: T[]; nextPageToken?: string }>(path, {
      ...params,
      ...(pageToken ? { pageToken } : {}),
    });
    items.push(...(page.items ?? []));
    if (!page.nextPageToken) return items;
    pageToken = page.nextPageToken;
    if (seen.has(pageToken)) break;
    seen.add(pageToken);
  }
  throw new CalendarError(502, "Google 목록을 끝까지 읽지 못했어요.");
}
async function selected(
  e: CalendarEnv,
  owner: string,
  link: Link,
  id: string | null | undefined,
) {
  if (!id || !permitted(e, id) || id !== link.calendar) throw noTarget();
  const current = await getLink(e, owner);
  if (current?.generation !== link.generation || current.calendar !== id)
    throw noTarget();
  return id;
}

async function run(
  request: Request,
  e: CalendarEnv,
  owner: string | null,
  http: typeof fetch,
) {
  if (!owner) throw new CalendarError(401, "Log365에 먼저 로그인해 주세요.");
  const url = new URL(request.url),
    post = request.method === "POST",
    callback = url.pathname.endsWith("/callback");
  if (!post && request.method !== "GET")
    throw new CalendarError(405, "지원하지 않는 요청이에요.");
  if (
    post &&
    (request.headers.get("origin") !== url.origin ||
      !request.headers.get("content-type")?.startsWith("application/json"))
  )
    throw new CalendarError(403, "Log365에서 다시 시도해 주세요.");
  const ready = configured(e),
    testing = e.GOOGLE_CALENDAR_MODE !== "live";
  const op = post ? null : (url.searchParams.get("op") ?? "state");
  if (!ready && op === "state" && !callback)
    return json({
      configured: false,
      connected: false,
      calendarId: null,
      testing,
    });
  if (!ready)
    throw new CalendarError(
      503,
      "Google 연동 설정이 준비되면 연결할 수 있어요.",
    );
  if (url.origin !== new URL(e.GOOGLE_REDIRECT_URI!).origin)
    throw new CalendarError(403, "등록한 Log365 주소에서 접속해 주세요.");
  if (callback) {
    if (post) throw new CalendarError(405, "잘못된 인증 요청이에요.");
    const nonce =
      request.headers
        .get("cookie")
        ?.match(/(?:^|; *)log365_gc_nonce=([a-f0-9-]{36})(?:;|$)/)?.[1] ?? "";
    await finish(e, owner, url.searchParams, nonce, http);
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        Location: "/?google=connected",
        "Set-Cookie":
          "log365_gc_nonce=; Path=/api/google-calendar; HttpOnly; SameSite=Lax; Max-Age=0",
      },
    });
  }
  const data: Input = post
    ? ((await request.json().catch(() => null)) as Input)
    : { op: op! };
  if (!data || typeof data.op !== "string")
    throw new CalendarError(400, "요청 형식을 확인해 주세요.");
  const link = await getLink(e, owner);
  if (!post && data.op === "state")
    return json({
      configured: true,
      connected: !!link,
      generation: link?.generation,
      calendarId:
        link?.calendar && permitted(e, link.calendar) ? link.calendar : null,
      testing,
    });
  if (post && data.op === "connect") {
    const nonce = crypto.randomUUID();
    const response = json({ url: await begin(e, owner, nonce) });
    response.headers.set(
      "Set-Cookie",
      "log365_gc_nonce=" +
        nonce +
        "; Path=/api/google-calendar; HttpOnly; SameSite=Lax; Max-Age=600" +
        (url.protocol === "https:" ? "; Secure" : ""),
    );
    return response;
  }
  if (!link) throw new CalendarError(409, "먼저 Google 계정을 연결해 주세요.");
  if (post && data.generation !== link.generation) throw noTarget();
  if (post && data.op === "disconnect") {
    await e.DB!.batch([
      e
        .DB!.prepare("DELETE FROM google_calendar_states WHERE owner=?")
        .bind(owner),
      e
        .DB!.prepare(
          "DELETE FROM google_calendar_links WHERE owner=? AND generation=?",
        )
        .bind(owner, link.generation),
    ]);
    return json({ ok: true });
  }
  const call = googleClient(await token(e, link, http), http);
  if (!post && data.op === "calendars") {
    // A test grant never enumerates the visitor's other calendar names.
    const fields = "id,summary,accessRole";
    const options = testing
      ? [
          await call<Target>(
            "/users/me/calendarList/" +
              encodeURIComponent(e.GOOGLE_CALENDAR_TEST_ID!),
            { fields },
          ),
        ]
      : await pages<Target>(call, "/users/me/calendarList", {
          minAccessRole: "owner",
          fields: "nextPageToken,items(" + fields + ")",
          maxResults: "250",
        });
    return json(
      options
        .filter((c) => c.accessRole === "owner" && permitted(e, c.id))
        .map(({ id, summary }) => ({ id, name: summary })),
    );
  }
  if (post && data.op === "select") {
    const id = data.calendarId;
    if (!id || id === "primary" || !permitted(e, id) || id.length > 1024)
      throw noTarget();
    const target = await call<Target>(
      "/users/me/calendarList/" + encodeURIComponent(id),
      { fields: "id,accessRole" },
    );
    if (target.id !== id || target.accessRole !== "owner")
      throw new CalendarError(403, "소유한 캘린더를 선택해 주세요.");
    const written = await e
      .DB!.prepare(
        "UPDATE google_calendar_links SET calendar=?,generation=? WHERE owner=? AND generation=?",
      )
      .bind(id, crypto.randomUUID(), owner, link.generation)
      .run();
    if (!written.meta.changes) throw noTarget();
    return json({ ok: true });
  }
  const id = await selected(
    e,
    owner,
    link,
    post ? data.calendarId : url.searchParams.get("calendarId"),
  );
  const path = "/calendars/" + encodeURIComponent(id) + "/events";
  const marker = testing
    ? hex(await digest("Log365 test v1\n" + owner + "\n" + id))
    : "";
  const slots = marker
    ? ["a", "b"].map((s) => "365" + marker.slice(0, 36) + s)
    : [];
  if (!post && data.op === "events") {
    const results = await pages<WireEvent>(call, path, {
      ...windowFor(url.searchParams.get("month") ?? ""),
      singleEvents: "true",
      showDeleted: "false",
      timeZone: zone,
      orderBy: "startTime",
      maxResults: "2500",
      fields: "nextPageToken,items(" + eventFields + ")",
      ...(testing ? { privateExtendedProperty: "log365Test=" + marker } : {}),
    });
    return json(
      results
        .filter(
          (r) =>
            r.status !== "cancelled" &&
            (!testing ||
              (slots.includes(r.id) &&
                r.extendedProperties?.private?.log365Test === marker)),
        )
        .map((r) => projectEvent(id, r)),
    );
  }
  if (!post) throw new CalendarError(400, "지원하지 않는 요청이에요.");
  if (data.op === "create" && data.draft) {
    const body = eventBody(data.draft);
    if (!data.requestId || !/^[a-f0-9]{32}$/.test(data.requestId))
      throw new CalendarError(400, "일정 ID를 확인해 주세요.");
    const eventId = testing
      ? slots[data.draft.allDay ? 1 : 0]
      : "365" + data.requestId;
    if (testing)
      body.summary =
        "Log365 연동 테스트" + (data.draft.allDay ? " · 종일" : "");
    const created = await call<WireEvent>(
      path,
      { sendUpdates: "none", conferenceDataVersion: "1", fields: eventFields },
      "POST",
      {
        ...body,
        id: eventId,
        conferenceData: null,
        ...(testing
          ? {
              reminders: { useDefault: false, overrides: [] },
              extendedProperties: { private: { log365Test: marker } },
            }
          : {}),
      },
    );
    if (created.id !== eventId)
      throw new CalendarError(502, "Google의 저장 결과를 확인할 수 없어요.");
    return json(projectEvent(id, created), 201);
  }
  if (
    !["update", "delete"].includes(data.op) ||
    !data.eventId ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,1023}$/.test(data.eventId) ||
    (testing && !slots.includes(data.eventId))
  )
    throw new CalendarError(400, "변경할 수 없는 일정이에요.");
  const eventPath = path + "/" + encodeURIComponent(data.eventId);
  const raw = await call<WireEvent>(eventPath, {
    fields: eventFields,
    timeZone: zone,
  });
  if (raw.status === "cancelled")
    throw new CalendarError(410, "이미 삭제된 일정이에요.");
  const current = projectEvent(id, raw);
  if (
    raw.id !== data.eventId ||
    current.readOnly ||
    (testing && raw.extendedProperties?.private?.log365Test !== marker)
  )
    throw new CalendarError(403, "이 일정은 읽기 전용이에요.");
  if (!current.etag || data.etag !== current.etag)
    throw new CalendarError(
      412,
      "다른 앱에서 일정이 바뀌었어요. 다시 열어 주세요.",
    );
  await selected(e, owner, link, id);
  if (data.op === "delete") {
    await call(
      eventPath,
      { sendUpdates: "none" },
      "DELETE",
      undefined,
      current.etag,
    );
    return json({ ok: true });
  }
  if (!data.draft) throw new CalendarError(400, "일정을 입력해 주세요.");
  const patch = eventBody(data.draft, current);
  if (!Object.keys(patch).length) return json(current);
  const updated = await call<WireEvent>(
    eventPath,
    { sendUpdates: "none", fields: eventFields },
    "PATCH",
    patch,
    current.etag,
  );
  return json(projectEvent(id, updated));
}
export async function calendarRequest(
  request: Request,
  env: CalendarEnv,
  owner: string | null,
  http: typeof fetch = fetch,
) {
  try {
    return await run(request, env, owner, http);
  } catch (err) {
    if (
      request.method === "GET" &&
      new URL(request.url).pathname.endsWith("/callback")
    )
      return new Response(null, {
        status: 303,
        headers: {
          ...headers,
          Location:
            "/?google=" +
            (err instanceof ConsentError
              ? err.reason
              : !owner
                ? "session"
                : "failed"),
        },
      });
    return json(
      {
        error:
          err instanceof CalendarError
            ? err.message
            : "처리 결과를 확인할 수 없어요. 새로고침해 주세요.",
      },
      err instanceof CalendarError ? err.status : 502,
    );
  }
}
