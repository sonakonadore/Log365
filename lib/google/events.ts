import {
  calendarDays,
  shift,
  validDay,
  validMonth,
  type EventItem,
} from "../diary.ts";

export const zone = "Asia/Seoul";
export type EventFields = {
  title: string;
  allDay: boolean;
  day: string;
  endDay: string;
  start: string;
  end: string;
};
export type GoogleEvent = EventFields & {
  calendarId: string;
  eventId: string;
  etag: string;
  readOnly: boolean;
};
export type DisplayEvent = EventItem & { google?: GoogleEvent };
type Boundary = { date?: string; dateTime?: string; timeZone?: string };
export type WireEvent = {
  id: string;
  etag: string;
  summary?: string;
  status?: string;
  start: Boundary;
  end: Boundary;
  recurringEventId?: string;
  recurrence?: string[];
  attendees?: unknown[];
  attendeesOmitted?: boolean;
  organizer?: { self?: boolean };
  locked?: boolean;
  endTimeUnspecified?: boolean;
  eventType?: string;
  extendedProperties?: { private?: Record<string, string> };
};
export class CalendarError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export const connectionMessages = {
  connected:
    "Google 계정 연결 완료 · 설정 → Google Calendar에서 대상 캘린더를 선택해 주세요.",
  session:
    "Log365 로그인이나 연결 요청이 만료됐어요. 같은 브라우저에서 다시 연결해 주세요.",
  denied: "Google 승인이 취소됐어요. 설정에서 다시 연결할 수 있어요.",
  permissions:
    "Google Calendar 연결에는 캘린더 목록 조회와 소유한 일정 편집 권한이 모두 필요해요.",
  grant:
    "Google이 연결 요청을 승인하지 않았어요. 설정에서 새 연결을 시작해 주세요.",
  offline:
    "Google에서 장기 연결 권한을 받지 못했어요. 설정에서 다시 연결해 주세요.",
  network: "Log365 서버에서 Google 인증 서버에 연결하지 못했어요.",
  failed: "Google 연결을 완료하지 못했어요. 설정에서 다시 시도해 주세요.",
} as const;
export type ConnectionResult = keyof typeof connectionMessages;
export function validateFields(fields: EventFields) {
  if (
    !fields ||
    typeof fields.title !== "string" ||
    !fields.title.trim() ||
    fields.title.length > 256 ||
    typeof fields.allDay !== "boolean" ||
    !validDay(fields.day) ||
    !validDay(fields.endDay) ||
    fields.endDay < fields.day
  )
    throw new CalendarError(400, "제목과 날짜를 확인해 주세요.");
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (
    !fields.allDay &&
    (typeof fields.start !== "string" ||
      typeof fields.end !== "string" ||
      !clock.test(fields.start) ||
      !clock.test(fields.end) ||
      fields.day + fields.start >= fields.endDay + fields.end)
  )
    throw new CalendarError(400, "종료 시각은 시작 시각보다 늦어야 해요.");
}
const seoul = new Intl.DateTimeFormat("sv-SE", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function local(boundary: Boundary) {
  if (boundary.date && validDay(boundary.date)) return [boundary.date, ""];
  const iso = boundary.dateTime ?? "";
  if (!/(Z|[+-]\d\d:\d\d)$/i.test(iso) || !Number.isFinite(Date.parse(iso)))
    throw new CalendarError(502, "Google 일정의 시간대를 읽을 수 없어요.");
  return seoul.format(new Date(iso)).split(" ");
}
export function projectEvent(calendarId: string, raw: WireEvent): GoogleEvent {
  const [day, start] = local(raw.start),
    [until, end] = local(raw.end);
  const allDay = Boolean(raw.start.date);
  return {
    calendarId,
    eventId: raw.id,
    etag: raw.etag,
    title: raw.summary || "(제목 없음)",
    day,
    start,
    allDay,
    end,
    endDay: allDay ? shift(until, -1) : until,
    readOnly: Boolean(
      raw.recurringEventId ||
        raw.recurrence?.length ||
        raw.attendees?.length ||
        raw.attendeesOmitted ||
        raw.locked ||
        raw.endTimeUnspecified ||
        !raw.etag ||
        (raw.organizer && raw.organizer.self !== true) ||
        (raw.eventType && raw.eventType !== "default"),
    ),
  };
}
export function displayEvent(event: GoogleEvent): DisplayEvent {
  const last =
    !event.allDay && event.end === "00:00" && event.endDay > event.day
      ? shift(event.endDay, -1)
      : event.endDay;
  return {
    id: "google:" + JSON.stringify([event.calendarId, event.eventId]),
    version: 0,
    google: event,
    data: {
      kind: "event",
      day: event.day,
      endDay: last,
      title: event.title,
      time: event.start,
      color: 7,
    },
  };
}
export function eventBody(f: EventFields, original?: GoogleEvent) {
  validateFields(f);
  type WriteBoundary = {
    date?: string | null;
    dateTime?: string | null;
    timeZone?: string | null;
  };
  const body: { summary?: string; start?: WriteBoundary; end?: WriteBoundary } =
    {};
  function boundary(day: string, time: string): WriteBoundary {
    const changingType = original && original.allDay !== f.allDay;
    if (f.allDay)
      return {
        date: day,
        ...(changingType ? { dateTime: null, timeZone: null } : {}),
      };
    return {
      dateTime: day + "T" + time + ":00",
      timeZone: zone,
      ...(changingType ? { date: null } : {}),
    };
  }
  if (!original || f.title !== original.title) body.summary = f.title.trim();
  if (
    !original ||
    f.allDay !== original.allDay ||
    f.day !== original.day ||
    f.start !== original.start
  )
    body.start = boundary(f.day, f.start);
  if (
    !original ||
    f.allDay !== original.allDay ||
    f.endDay !== original.endDay ||
    f.end !== original.end
  )
    body.end = boundary(f.allDay ? shift(f.endDay, 1) : f.endDay, f.end);
  return body;
}
export function windowFor(month: string) {
  if (!validMonth(month)) throw new CalendarError(400, "달을 확인해 주세요.");
  const days = calendarDays(month);
  return {
    timeMin: days[0] + "T00:00:00+09:00",
    timeMax: shift(days[days.length - 1], 1) + "T00:00:00+09:00",
  };
}
