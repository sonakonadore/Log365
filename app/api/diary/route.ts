import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { records } from "../../../db/schema";
import {
  calendarDays,
  occurrenceInRange,
  validEntry,
  validMonth,
  periodFor,
  type Entry,
} from "../../../lib/diary";

export const dynamic = "force-dynamic";
const reply = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "로그인 후 이용해 주세요." }, 401);
  const params = new URL(request.url).searchParams;
  const year = params.get("goalYear");
  const month = params.get("month");
  if (year !== null ? !/^\d{4}$/.test(year) : !validMonth(month))
    return reply({ error: "날짜를 확인해 주세요." }, 400);
  let selection;
  const days = month && !year ? calendarDays(month) : [];
  if (year !== null) {
    selection = or(
      eq(records.id, "settings"),
      like(records.id, `goal-${year}-__-%`),
    );
  } else {
    selection = or(
      inArray(records.period, [month!, month!.slice(0, 4), "settings"]),
      and(
        like(records.id, "event-%"),
        sql`json_extract(${records.content}, '$.day') <= ${days[days.length - 1]}`,
        or(
          sql`json_extract(${records.content}, '$.repeat.frequency') is not null`,
          sql`coalesce(json_extract(${records.content}, '$.endDay'), json_extract(${records.content}, '$.day')) >= ${days[0]}`,
        ),
      ),
    );
  }
  const rows = await getDb()
    .select()
    .from(records)
    .where(and(eq(records.owner, user.userId), selection));
  return reply(
    rows
      .map((r) => ({
        id: r.id,
        version: r.version,
        data: JSON.parse(r.content) as Entry,
      }))
      .filter(
        ({ data }) =>
          data.kind !== "event" ||
          !data.repeat ||
          occurrenceInRange(data, days[0], days[days.length - 1]),
      ),
  );
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "로그인 후 이용해 주세요." }, 401);
  const origin = request.headers.get("origin");
  if (
    origin &&
    new URL(origin).host !== new URL(request.url).host &&
    new URL(origin).host !== request.headers.get("host")
  )
    return reply({ error: "잘못된 요청입니다." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({}, 415);
  const payload = (await request.json().catch(() => null)) as {
    id: string;
    data: Entry | null;
    version: number;
  } | null;
  if (!payload) return reply({}, 400);
  const { id, data, version } = payload;
  if (
    typeof id !== "string" ||
    id.length > 90 ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    (data === null ? version === 0 : !validEntry(id, data))
  )
    return reply({ error: "입력값을 확인해 주세요." }, 400);
  const db = getDb(),
    owner = user.userId;
  const match = and(
    eq(records.owner, owner),
    eq(records.id, id),
    eq(records.version, version),
  );
  let changed;
  if (data === null) {
    changed = await db
      .delete(records)
      .where(match)
      .returning({ id: records.id });
  } else {
    const values = {
      content: JSON.stringify(data),
      period: periodFor(data),
      version: Math.max(Date.now(), version + 1),
    };
    changed =
      version === 0
        ? await db
            .insert(records)
            .values({ owner, id, ...values })
            .onConflictDoNothing()
            .returning({ id: records.id })
        : await db
            .update(records)
            .set(values)
            .where(match)
            .returning({ id: records.id });
  }
  return changed.length
    ? reply({ ok: true })
    : reply(
        {
          error:
            "다른 기기에서 이 항목을 수정했습니다. 창을 닫고 최신 내용을 확인해 주세요.",
        },
        409,
      );
}
