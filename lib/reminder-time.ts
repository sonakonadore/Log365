import { occurrenceInRange, type DiaryEvent } from "./diary.ts";

export const minute = 60_000;
const localFormat = new Map<string, Intl.DateTimeFormat>();
function localMinute(at: number, zone: string) {
  let format = localFormat.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    localFormat.set(zone, format);
  }
  return format.format(at);
}

// Compare actual instants in the event's time zone, including across DST changes.
export function reminderDue(event: DiaryEvent, now: number, since: number) {
  if (!event.reminder) return;
  const lead = event.reminder.minutes * minute;
  const time = event.time || "09:00";
  const end = Math.floor(now / minute) * minute;
  for (
    let due = end;
    due >= Math.floor(since / minute) * minute;
    due -= minute
  ) {
    const local = localMinute(due + lead, event.reminder.zone);
    if (!local.endsWith(" " + time)) continue;
    const day = local.slice(0, 10);
    if (occurrenceInRange(event, day, day)?.day === day) return { day, due };
  }
}
