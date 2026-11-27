export const palette = [
  "#FD3B32",
  "#FE9123",
  "#FDC31B",
  "#96C52C",
  "#36C83B",
  "#02D4AB",
  "#03C8EC",
  "#5B8BFD",
  "#945FFC",
  "#CA63DA",
  "#FC79B3",
  "#A5897C",
] as const;
export const marks = ["", "✓", "△", "×"] as const;
export const themeNames = {
  "warm-white": "warm white",
  "pale-white": "pale white",
  "warm-gray": "warm gray",
  "cold-black": "cold black",
} as const;
export type Theme = keyof typeof themeNames;
export const defaultTheme: Theme = "pale-white";
export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && Object.hasOwn(themeNames, value);
}
export type Mark = (typeof marks)[number];
export const frequencies = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
} as const;
export type Recurrence = {
  frequency: keyof typeof frequencies;
  count: number | null;
};
export const reminderOptions = [
  [0, "시작할 때"],
  [5, "5분 전"],
  [10, "10분 전"],
  [15, "15분 전"],
  [30, "30분 전"],
  [60, "1시간 전"],
  [1440, "1일 전"],
] as const;
export type Reminder = { minutes: number; zone: string };
function validReminder(value: Reminder) {
  if (
    !value ||
    !reminderOptions.some(([minutes]) => minutes === value.minutes) ||
    typeof value.zone !== "string" ||
    !value.zone ||
    value.zone.length > 80
  )
    return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.zone });
    return true;
  } catch {
    return false;
  }
}
export type Entry =
  | {
      kind: "event";
      day: string;
      endDay?: string;
      time: string;
      title: string;
      color: number;
      repeat?: Recurrence;
      reminder?: Reminder;
    }
  | { kind: "goal"; period: string; slot: number; title: string; mark: Mark }
  | { kind: "todo"; day: string; title: string; mark: Mark }
  | { kind: "note"; day: string; text: string }
  | { kind: "settings"; weights: number[]; theme?: Theme };
export type Item = { id: string; version: number; data: Entry };
export const defaults = {
  kind: "settings" as const,
  weights: [2, 1, 0],
};
export function keyDate(d: Date) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
export function asDate(s: string) {
  return new Date(s + "T12:00:00");
}
export function validDay(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^\d{4}-\d\d-\d\d$/.test(s) &&
    keyDate(asDate(s)) === s
  );
}
export function validMonth(s: unknown): s is string {
  return typeof s === "string" && validDay(s + "-01");
}
export function periodFor(data: Entry) {
  if (data.kind === "settings") return "settings";
  if (data.kind === "goal") return data.period;
  return data.day.slice(0, 7);
}
function shortText(s: unknown, max: number) {
  return typeof s === "string" && s.trim().length > 0 && s.length <= max;
}
export function validEntry(id: string, data: Entry): boolean {
  if (!data || typeof data !== "object") return false;
  switch (data.kind) {
    case "event":
      return (
        /^event-[a-f0-9-]{36}$/.test(id) &&
        validDay(data.day) &&
        (data.reminder === undefined || validReminder(data.reminder)) &&
        (data.repeat === undefined ||
          (data.repeat !== null &&
            typeof data.repeat === "object" &&
            typeof data.repeat.frequency === "string" &&
            Object.hasOwn(frequencies, data.repeat.frequency) &&
            (data.repeat.count === null ||
              (Number.isSafeInteger(data.repeat.count) &&
                data.repeat.count > 0)))) &&
        (data.endDay === undefined ||
          (validDay(data.endDay) && data.endDay >= data.day)) &&
        shortText(data.title, 160) &&
        (data.time === "" ||
          (typeof data.time === "string" &&
            /^([01]\d|2[0-3]):[0-5]\d$/.test(data.time))) &&
        Number.isInteger(data.color) &&
        data.color >= 0 &&
        data.color < palette.length
      );
    case "todo":
      return (
        /^todo-\d{13}-[a-f0-9-]{36}$/.test(id) &&
        validDay(data.day) &&
        shortText(data.title, 160) &&
        marks.includes(data.mark)
      );
    case "goal":
      return (
        typeof data.period === "string" &&
        (validMonth(data.period) || /^\d{4}$/.test(data.period)) &&
        id === "goal-" + data.period + "-" + data.slot &&
        Number.isInteger(data.slot) &&
        data.slot >= 0 &&
        data.slot < (data.period.length === 4 ? 12 : 7) &&
        shortText(data.title, 160) &&
        marks.includes(data.mark)
      );
    case "note":
      return (
        validDay(data.day) &&
        id === "note-" + data.day &&
        shortText(data.text, 6000)
      );
    case "settings":
      return (
        id === "settings" &&
        (data.theme === undefined || isTheme(data.theme)) &&
        Array.isArray(data.weights) &&
        data.weights.length === 3 &&
        data.weights.every((x) => Number.isInteger(x) && x >= 0 && x <= 100)
      );
    default:
      return false;
  }
}

export type DiaryEvent = Extract<Entry, { kind: "event" }>;
export type EventItem = Item & { data: DiaryEvent };

export function shift(day: string, days: number) {
  const date = asDate(day);
  date.setDate(date.getDate() + days);
  return keyDate(date);
}
export function calendarDays(month: string) {
  const first = asDate(month + "-01");
  const offset = first.getDay();
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return Array.from({ length: Math.ceil((offset + last) / 7) * 7 }, (_, i) =>
    shift(month + "-01", i - offset),
  );
}
function daysApart(from: string, to: string) {
  return (Date.parse(to) - Date.parse(from)) / 86400000;
}

function monthIndex(date: string) {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function inMonth(day: string, month: number) {
  return (
    Math.floor(month / 12) +
    "-" +
    String((month % 12) + 1).padStart(2, "0") +
    day.slice(7)
  );
}

function lastStartThrough(start: string, through: string, repeat: Recurrence) {
  const { frequency, count } = repeat;
  if (frequency === "daily" || frequency === "weekly") {
    const step = frequency === "weekly" ? 7 : 1;
    let index = Math.floor(daysApart(start, through) / step);
    if (count !== null) index = Math.min(index, count - 1);
    return shift(start, index * step);
  }
  const origin = monthIndex(start);
  const step = frequency === "yearly" ? 12 : 1;
  let index = Math.floor((monthIndex(through) - origin) / step);
  function candidate(i: number) {
    return inMonth(start, origin + i * step);
  }
  if (count !== null && count <= index) {
    const canSkip =
      frequency === "monthly"
        ? Number(start.slice(8)) > 28
        : start.endsWith("-02-29");
    if (canSkip) {
      // Missing dates, such as February 29, do not consume an occurrence.
      let remaining = count;
      for (let i = 0; i <= index; i++) {
        if (validDay(candidate(i)) && --remaining === 0) {
          index = i;
          break;
        }
      }
    } else index = count - 1;
  }
  while (index > 0) {
    const date = candidate(index--);
    if (date <= through && validDay(date)) return date;
  }
  return start;
}

export function occurrenceInRange(
  event: DiaryEvent,
  first: string,
  last: string,
) {
  if (event.day > last) return null;
  const day = event.repeat
    ? lastStartThrough(event.day, last, event.repeat)
    : event.day;
  const endDay =
    event.endDay && event.endDay !== event.day
      ? shift(day, daysApart(event.day, event.endDay))
      : day;
  return endDay >= first ? { day, endDay } : null;
}

export function onDay(event: DiaryEvent, day: string) {
  return occurrenceInRange(event, day, day) !== null;
}
export function movedEvent(
  event: DiaryEvent,
  from: string,
  to: string,
  occurrenceStart = event.day,
): DiaryEvent {
  let day = shift(occurrenceStart, daysApart(from, to));
  const frequency = event.repeat?.frequency;
  if (
    occurrenceStart !== event.day &&
    (frequency === "monthly" || frequency === "yearly")
  ) {
    // Keep the dragged occurrence at the same position in the series, even when months are skipped.
    const step = frequency === "monthly" ? 1 : 12;
    let previous = monthIndex(day);
    for (
      let m = monthIndex(event.day);
      m < monthIndex(occurrenceStart);
      m += step
    ) {
      if (!validDay(inMonth(event.day, m))) continue;
      do {
        previous -= step;
        if (previous < 1000 * 12)
          throw new Error("첫 일정의 날짜 범위를 벗어납니다.");
      } while (!validDay(inMonth(day, previous)));
    }
    day = inMonth(day, previous);
  } else day = shift(event.day, daysApart(from, to));
  return {
    ...event,
    day,
    endDay: event.endDay
      ? shift(day, daysApart(event.day, event.endDay))
      : undefined,
  };
}
