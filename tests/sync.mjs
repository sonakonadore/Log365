import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = new URL(
  process.env.LOG365_TEST_URL ||
    process.env.NAKILOG_TEST_URL ||
    "http://127.0.0.1:48161",
);
assert.equal(base.hostname, "127.0.0.1", "Use a local test Worker");
const url = new URL("/api/diary?month=2032-02", base);
const owner = "test-" + randomUUID();
const identity = (user) => ({
  "oai-authenticated-user-id": user,
  "oai-authenticated-user-email": user + "@example.test",
});
const read = async (user = owner) => {
  const res = await fetch(url, { headers: identity(user) });
  assert.equal(res.status, 200);
  return res.json();
};
const write = (id, data, version) =>
  fetch(url, {
    method: "POST",
    headers: { ...identity(owner), "content-type": "application/json" },
    body: JSON.stringify({ id, data, version }),
  });
assert.equal((await fetch(base)).status, 200);
assert.equal((await fetch(url)).status, 401);
const id = "event-" + randomUUID();
const event = {
  kind: "event",
  day: "2032-02-29",
  title: "동기화 검사",
  time: "09:00",
  color: 11,
};
assert.equal((await write(id, event, 0)).status, 200);
const [saved] = await read();
assert.deepEqual(saved.data, event);
assert.deepEqual(await read(owner + "-other"), []);
const concurrent = await Promise.all(
  ["새 제목 A", "새 제목 B"].map((title) =>
    write(id, { ...event, title }, saved.version),
  ),
);
assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
const [latest] = await read();
assert.equal((await write(id, null, latest.version)).status, 200);
assert.deepEqual(await read(), []);
for (const [period, limit] of [
  ["2032-02", 7],
  ["2032", 12],
]) {
  const goal = {
    kind: "goal",
    period,
    slot: limit - 1,
    title: "마지막 목표",
    mark: "△",
  };
  const key = "goal-" + period + "-" + goal.slot;
  assert.equal((await write(key, goal, 0)).status, 200);
  assert.equal(
    (await write("goal-" + period + "-" + limit, { ...goal, slot: limit }, 0))
      .status,
    400,
  );
  const row = (await read()).find((r) => r.id === key);
  assert.equal(row.data.mark, "△");
  assert.equal((await write(key, null, row.version)).status, 200);
}
const summaryUrl = new URL("/api/diary?goalYear=2032", base);
const periods = ["2032-01", "2032-12", "2032", "2031-12"];
for (const period of periods) {
  const goal = { kind: "goal", period, slot: 0, title: period, mark: "✓" };
  assert.equal((await write(`goal-${period}-0`, goal, 0)).status, 200);
}
assert.equal((await write(id, event, 0)).status, 200);
assert.equal((await fetch(summaryUrl)).status, 401);
const summary = await (
  await fetch(summaryUrl, { headers: identity(owner) })
).json();
assert.deepEqual(summary.map((row) => row.data.period).sort(), [
  "2032-01",
  "2032-12",
]);
assert.deepEqual(
  await (
    await fetch(summaryUrl, { headers: identity(owner + "-other") })
  ).json(),
  [],
);
for (const period of periods) {
  const lookup = new URL(
    "/api/diary?month=" + (period.length === 4 ? period + "-01" : period),
    base,
  );
  const rows = await (await fetch(lookup, { headers: identity(owner) })).json();
  const goal = rows.find((r) => r.id === `goal-${period}-0`);
  assert.equal((await write(goal.id, null, goal.version)).status, 200);
}
const remaining = (await read()).find((row) => row.id === id);
assert.equal((await write(id, null, remaining.version)).status, 200);
const span = { ...event, day: "2032-01-30", endDay: "2032-03-01" };
assert.equal((await write(id, span, 0)).status, 200);
for (const month of ["2032-01", "2032-02", "2032-03", "2032-04"]) {
  const response = await fetch(new URL("/api/diary?month=" + month, base), {
    headers: identity(owner),
  });
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(
    rows.some((r) => r.id === id),
    month !== "2032-04",
  );
}
const [storedSpan] = await read();
assert.equal(
  (await write(id, { ...span, endDay: "2032-01-29" }, storedSpan.version))
    .status,
  400,
);
assert.equal(
  (
    await write(
      id,
      { ...span, day: "2032-05-01", endDay: "2032-06-01" },
      storedSpan.version,
    )
  ).status,
  200,
);
assert.deepEqual(await read(), []);
const may = await (
  await fetch(new URL("/api/diary?month=2032-05", base), {
    headers: identity(owner),
  })
).json();
assert.equal((await write(id, null, may[0].version)).status, 200);
const todoId = "todo-" + Date.now() + "-" + randomUUID();
const todo = { kind: "todo", day: "2032-02-29", title: "매일 할 일", mark: "" };
assert.equal((await write(todoId, todo, 0)).status, 200);
let [task] = await read();
assert.deepEqual(task.data, todo);
assert.deepEqual(await read(owner + "-other"), []);
assert.equal(
  (await write(todoId, { ...todo, mark: "?" }, task.version)).status,
  400,
);
for (const mark of ["✓", "△", "×", ""]) {
  assert.equal(
    (await write(todoId, { ...todo, mark }, task.version)).status,
    200,
  );
  [task] = await read();
  assert.equal(task.data.mark, mark);
}
assert.equal((await write(todoId, null, task.version)).status, 200);
const series = {
  ...event,
  day: "2031-12-29",
  repeat: { frequency: "weekly", count: 8 },
};
assert.equal((await write(id, series, 0)).status, 200);
const [inFebruary] = await read();
assert.deepEqual(inFebruary.data, series);
assert.deepEqual(await read(owner + "-other"), []);
assert.equal(
  (
    await write(
      id,
      { ...series, repeat: { frequency: "weekly", count: 1 } },
      inFebruary.version,
    )
  ).status,
  200,
);
assert.deepEqual(await read(), []);
const initialMonth = new URL("/api/diary?month=2031-12", base);
const [shortened] = await (
  await fetch(initialMonth, { headers: identity(owner) })
).json();
assert.equal(
  (
    await write(
      id,
      { ...series, repeat: { frequency: "yearly", count: null } },
      shortened.version,
    )
  ).status,
  200,
);
const nextYear = new URL("/api/diary?month=2032-12", base);
const [annual] = await (
  await fetch(nextYear, { headers: identity(owner) })
).json();
assert.equal(annual.id, id);
assert.equal((await write(id, null, annual.version)).status, 200);
assert.deepEqual(
  await (await fetch(nextYear, { headers: identity(owner) })).json(),
  [],
);
console.log(
  "Passed: page, authentication, shared records, isolation, concurrent writes, deletion, leap day, goal limits and daily to-do marks.",
);
