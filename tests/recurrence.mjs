import assert from "node:assert/strict";
import {
  occurrenceInRange,
  onDay,
  movedEvent,
  validEntry,
} from "../lib/diary.ts";

const event = {
  kind: "event",
  title: "레슨",
  day: "2026-11-29",
  time: "15:00",
  color: 2,
};
const weekly = { ...event, repeat: { frequency: "weekly", count: 3 } };
assert.equal(onDay(weekly, "2026-11-22"), false);
assert.equal(onDay(weekly, "2026-12-06"), true);
assert.equal(onDay(weekly, "2026-12-13"), true);
assert.equal(onDay(weekly, "2026-12-14"), false);
assert.equal(onDay(weekly, "2026-12-20"), false);
assert.equal(
  onDay({ ...weekly, repeat: { frequency: "weekly", count: 1 } }, "2026-12-06"),
  false,
);
const span = { ...weekly, endDay: "2026-12-01" };
assert.deepEqual(occurrenceInRange(span, "2026-12-15", "2026-12-15"), {
  day: "2026-12-13",
  endDay: "2026-12-15",
});
const moved = movedEvent(span, "2026-12-14", "2026-12-16");
assert.equal(moved.day, "2026-12-01");
assert.equal(onDay(moved, "2026-12-17"), true);
const monthEnd = {
  ...event,
  day: "2027-01-31",
  repeat: { frequency: "monthly", count: 3 },
};
assert.equal(onDay(monthEnd, "2027-02-28"), false);
assert.equal(onDay(monthEnd, "2027-03-31"), true);
assert.equal(onDay(monthEnd, "2027-05-31"), true);
assert.equal(onDay(monthEnd, "2027-07-31"), false);
const endOfApril = { ...monthEnd, day: "2027-04-30" };
const shiftedMonth = movedEvent(
  endOfApril,
  "2027-05-30",
  "2027-05-31",
  "2027-05-30",
);
assert.equal(shiftedMonth.day, "2027-03-31");
assert.equal(onDay(shiftedMonth, "2027-05-31"), true);
const birthday = {
  ...event,
  day: "2096-02-29",
  repeat: { frequency: "yearly", count: 2 },
};
assert.equal(onDay(birthday, "2100-02-28"), false);
assert.equal(onDay(birthday, "2104-02-29"), true);
assert.equal(onDay(birthday, "2108-02-29"), false);
assert.equal(
  onDay(
    { ...event, repeat: { frequency: "yearly", count: null } },
    "2126-11-29",
  ),
  true,
);
assert.equal(
  onDay({ ...event, repeat: { frequency: "daily", count: 4 } }, "2026-12-02"),
  true,
);
assert.equal(onDay(event, "2026-12-06"), false);
const id = "event-" + crypto.randomUUID();
for (const repeat of [
  null,
  {},
  { frequency: "weekly", count: 0 },
  { frequency: "daily", count: 1.5 },
  { frequency: "other", count: null },
])
  assert.equal(validEntry(id, { ...event, repeat }), false);
console.log(
  "Recurrences verified across weeks, month ends, leap years and multi-day moves.",
);
