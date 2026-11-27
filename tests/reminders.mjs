import assert from "node:assert/strict";
import { reminderDue, minute } from "../lib/reminder-time.ts";
import { validEntry } from "../lib/diary.ts";

const base = {
  kind: "event",
  title: "레슨",
  color: 0,
  day: "2026-12-06",
  time: "11:00",
  reminder: { minutes: 10, zone: "Asia/Seoul" },
  repeat: { frequency: "weekly", count: 2 },
};
const at = (s) => Date.parse(s);
function due(event, instant) {
  const now = at(instant);
  return reminderDue(event, now, now - minute);
}
assert.equal(due(base, "2026-12-06T01:49:00Z"), undefined);
assert.equal(due(base, "2026-12-06T01:50:05Z").day, "2026-12-06");
assert.equal(due(base, "2026-12-13T01:50:05Z").day, "2026-12-13");
assert.equal(due(base, "2026-12-20T01:50:05Z"), undefined);
assert.equal(
  due({ ...base, endDay: "2026-12-08" }, "2026-12-07T01:50:00Z"),
  undefined,
);
assert.equal(
  due(
    { ...base, time: "", reminder: { minutes: 1440, zone: "Asia/Seoul" } },
    "2026-12-05T00:00:01Z",
  ).day,
  "2026-12-06",
);
assert.equal(
  due({ ...base, reminder: undefined }, "2026-12-06T01:50:00Z"),
  undefined,
);
const ny = {
  ...base,
  day: "2027-03-07",
  time: "09:00",
  reminder: { minutes: 0, zone: "America/New_York" },
};
assert.equal(due(ny, "2027-03-07T14:00:00Z").day, "2027-03-07");
assert.equal(due(ny, "2027-03-14T13:00:00Z").day, "2027-03-14");
const id = "event-" + crypto.randomUUID();
assert.ok(validEntry(id, base));
assert.equal(
  validEntry(id, { ...base, reminder: { minutes: -1, zone: "UTC" } }),
  false,
);
assert.equal(
  validEntry(id, { ...base, reminder: { minutes: 0, zone: "Nonsense" } }),
  false,
);
console.log(
  "Reminder timing, recurrence, all-day, timezone and validation checks passed.",
);
