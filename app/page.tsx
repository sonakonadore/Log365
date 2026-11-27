"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { Editor } from "./editor";
import { MonthGrid } from "./month-grid";
import { TodoDay } from "./todo-day";
import {
  asDate,
  validDay,
  calendarDays,
  onDay,
  shift,
  defaults,
  defaultTheme,
  isTheme,
  keyDate,
  marks,
  palette,
  type Entry,
  type Item,
  type Theme,
} from "../lib/diary";
const themeCacheKey = "log365.appearance";
const dayOffsets: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};
const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const tabs = [
  { view: "calendar", label: "calendar", key: "1" },
  { view: "goals", label: "goals", key: "2" },
  { view: "todo", label: "to-do", key: "3" },
] as const;
const weekday = (d: Date) => d.toLocaleDateString("ko-KR", { weekday: "long" });
type EventEntry = Extract<Entry, { kind: "event" }>;
function monthShift(day: string, amount: number) {
  const d = asDate(day),
    target = new Date(d.getFullYear(), d.getMonth() + amount, 1, 12);
  target.setDate(
    Math.min(
      d.getDate(),
      new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate(),
    ),
  );
  return keyDate(target);
}
function Help({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="help-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="sectionhead">
        <h2 id="help-title">키보드로 기록하기</h2>
        <button onClick={close} aria-label="닫기">
          ×
        </button>
      </div>
      <dl>
        {[
          ["1 / 2 / 3", "calendar / goals / to-do로 이동"],
          ["← → / ↑ ↓", "선택한 날짜에서 하루 / 일주일 이동"],
          ["Page Up / Down", "달력에서 이전 달 / 다음 달"],
          ["Enter · C", "선택한 날짜에 일정 추가"],
          ["Enter", "일정이나 목표 평가 저장"],
          ["Space", "Agenda로 이동 · 빈 날은 Journal 쓰기"],
          ["Backspace", "선택한 일정의 삭제 확인 열기"],
          ["T", "오늘로 이동"],
          ["⌘ / Ctrl + Enter", "편집 내용 저장"],
          ["Esc", "창 닫기"],
          ["?", "단축키 보기"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  );
}
type Goal = Extract<Entry, { kind: "goal" }>;

function GoalScore({ goals, weights }: { goals: Goal[]; weights: number[] }) {
  const rated = goals.filter((g) => g.mark);
  if (!rated.length) return null;
  const earned = rated.reduce(
    (sum, g) => sum + weights[marks.indexOf(g.mark) - 1],
    0,
  );
  const possible = rated.length * Math.max(...weights);
  return (
    <output className="goal-score" aria-label="평가한 목표 점수">
      {earned}/{possible}
    </output>
  );
}

function GoalList({
  goals,
  ready,
  onEdit,
}: {
  goals: Goal[];
  ready: boolean;
  onEdit: (goal: Goal) => void;
}) {
  return (
    <ol className="goal-list">
      {goals.map((g) => (
        <li key={g.slot}>
          <button
            disabled={!ready}
            aria-label={g.title ? undefined : g.slot + 1 + "번째 목표 입력"}
            onClick={() => onEdit(g)}
          >
            <span className="slot">{String(g.slot + 1).padStart(2, "0")}</span>
            <span>{g.title}</span>
            <b aria-label={g.mark || "미평가"}>{g.mark || "·"}</b>
          </button>
        </li>
      ))}
    </ol>
  );
}

function Wordmark() {
  return (
    <span className="wordmark">
      Log<span>365</span>
    </span>
  );
}

export default function Home() {
  const [savedTheme, setSavedTheme] = useState<Theme | null>(null);
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null);
  const [monthGoalsOpen, setMonthGoalsOpen] = useState(false);
  const [day, setDay] = useState(""),
    [view, setView] = useState<(typeof tabs)[number]["view"]>("calendar");
  const [scope, setScope] = useState<"month" | "overview" | "year">("month"),
    [items, setItems] = useState<Item[]>([]),
    [loaded, setLoaded] = useState("");
  const [status, setStatus] = useState("불러오는 중…"),
    [auth, setAuth] = useState(false),
    [editor, setEditor] = useState<Item | null>(null);
  const [help, setHelp] = useState(false),
    [filter, setFilter] = useState<number[]>([]),
    [deleteStart, setDeleteStart] = useState(false);
  const month = day.slice(0, 7),
    year = day.slice(0, 4),
    period = scope === "year" ? year : month;
  const overview = view === "goals" && scope === "overview";
  const query = day ? (overview ? "goalYear=" + year : "month=" + month) : "";
  const ticket = useRef(0),
    activeQuery = useRef(query),
    focusDate = useRef(false);
  activeQuery.current = query;
  useLayoutEffect(() => {
    let theme = previewTheme ?? savedTheme;
    try {
      if (savedTheme) localStorage.setItem(themeCacheKey, savedTheme);
      else if (!theme) {
        const cached = localStorage.getItem(themeCacheKey);
        if (isTheme(cached)) theme = cached;
      }
    } catch {
      // The current theme still works when browser storage is unavailable.
    }
    document.documentElement.dataset.theme = theme ?? defaultTheme;
  }, [savedTheme, previewTheme]);
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get("day");
    setDay(validDay(requested) ? requested : keyDate(new Date()));
  }, []);
  const refresh = useCallback(async () => {
    if (!query) return;
    const serial = ++ticket.current;
    try {
      const res = await fetch("/api/diary?" + query, {
        cache: "no-store",
      });
      if (activeQuery.current !== query || serial !== ticket.current) return;
      if (res.status === 401) {
        setAuth(true);
        setItems([]);
        setLoaded("");
        setStatus("로그인이 필요합니다");
        return;
      }
      if (!res.ok) throw new Error();
      const records: Item[] = await res.json();
      if (activeQuery.current !== query || serial !== ticket.current) return;
      setAuth(false);
      const prefs = records.find((row) => row.id === "settings")?.data;
      setSavedTheme(
        prefs?.kind === "settings" && isTheme(prefs.theme) ? prefs.theme : defaultTheme,
      );
      setItems(records);
      setLoaded(query);
      setStatus("동기화됨");
    } catch {
      if (activeQuery.current === query && serial === ticket.current)
        setStatus("연결 실패 · 다시 시도");
    }
  }, [query]);
  useEffect(() => {
    setStatus("불러오는 중…");
    void refresh();
    const sync = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    const timer = setInterval(sync, 15000);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (focusDate.current) {
      document
        .querySelector<HTMLButtonElement>('[data-day="' + day + '"]')
        ?.focus();
      focusDate.current = false;
    }
  }, [day, view]);
  const ready = !!query && loaded === query;
  const rows = ready ? items : [];
  function find(id: string) {
    return rows.find((r) => r.id === id);
  }
  const prefs = find("settings")?.data,
    settings = prefs?.kind === "settings" ? prefs : defaults;
  function edit(id: string, data: Entry, remove = false) {
    if (!ready) return;
    setDeleteStart(remove);
    setEditor(find(id) ?? { id, version: 0, data });
  }
  function add() {
    if (ready)
      edit("event-" + crypto.randomUUID(), {
        kind: "event",
        day,
        time: "",
        title: "",
        color: filter[0] ?? 0,
      });
  }
  function go(s: string, focus = false) {
    if (s === day && focus) {
      document.querySelector<HTMLButtonElement>('[data-day="' + s + '"]')?.focus();
      return;
    }
    focusDate.current = focus;
    setDay(s);
  }
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      const target = e.target;
      if (
        !(target instanceof HTMLElement) ||
        e.defaultPrevented ||
        document.querySelector("dialog[open]") ||
        editor ||
        help ||
        e.isComposing ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        target.isContentEditable ||
        target.closest("input,textarea,select")
      )
        return;
      const tab = tabs.find((tab) => tab.key === e.key);
      if (tab && !e.shiftKey) {
        e.preventDefault();
        setView(tab.view);
        document
          .querySelector<HTMLButtonElement>(
            `nav button[aria-keyshortcuts="${tab.key}"]`,
          )
          ?.focus({ preventScroll: true });
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
        return;
      }
      if (!day) return;
      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        go(keyDate(new Date()), true);
        return;
      }
      if (view !== "todo" && e.key.toLowerCase() === "c") {
        e.preventDefault();
        add();
        return;
      }
      if (view === "calendar" && Object.hasOwn(dayOffsets, e.key) && !e.shiftKey) {
        e.preventDefault();
        go(shift(target.dataset.day || day, dayOffsets[e.key]), true);
        return;
      }
      if (target.dataset.day) {
        if (e.key === "PageUp" || e.key === "PageDown") {
          e.preventDefault();
          go(monthShift(day, e.key === "PageUp" ? -1 : 1), true);
        } else if (e.key === "Enter" && !e.repeat) {
          e.preventDefault();
          add();
        } else if (e.key === " ") {
          e.preventDefault();
          (
            document.querySelector<HTMLButtonElement>(".agenda button") ??
            document.querySelector<HTMLButtonElement>(".ruled button")
          )?.focus();
        }
      }
      if (
        (e.key === "Backspace" || e.key === "Delete") &&
        target.dataset.event
      ) {
        e.preventDefault();
        const row = find(target.dataset.event);
        if (row) edit(row.id, row.data, true);
      }
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });
  if (!day)
    return (
      <main className="loading">
        <Wordmark />
      </main>
    );
  const date = asDate(day),
    today = keyDate(new Date());
  const cells = calendarDays(month);
  const events = rows
    .filter(
      (r): r is Item & { data: EventEntry } =>
        r.data.kind === "event" &&
        (!filter.length || filter.includes(r.data.color)),
    )
    .sort(
      (a, b) =>
        a.data.time.localeCompare(b.data.time) ||
        a.data.title.localeCompare(b.data.title, "ko"),
    );
  const daily = events.filter((r) => onDay(r.data, day));
  const note = find("note-" + day)?.data;
  function goalSlots(period: string) {
    return Array.from({ length: period.length === 4 ? 12 : 7 }, (_, slot) => {
      const data = find("goal-" + period + "-" + slot)?.data;
      return data?.kind === "goal"
        ? data
        : { kind: "goal" as const, period, slot, title: "", mark: "" as const };
    });
  }
  function openGoal(goal: Extract<Entry, { kind: "goal" }>) {
    edit("goal-" + goal.period + "-" + goal.slot, goal);
  }
  const slots = goalSlots(view === "calendar" ? month : period);
  function turn(amount: number) {
    if (view === "todo") {
      go(shift(day, amount));
      return;
    }
    go(
      monthShift(
        day,
        view === "goals" && scope !== "month" ? 12 * amount : amount,
      ),
    );
  }
  return (
    <>
      <header className="top glass-panel">
        <div className="brand">
          <img src="/diary.svg" alt="" />
          <Wordmark />
        </div>
        <nav aria-label="다이어리">
          {tabs.map((tab) => (
            <button
              key={tab.view}
              className={view === tab.view ? "active" : ""}
              aria-current={view === tab.view ? "page" : undefined}
              aria-keyshortcuts={tab.key}
              onClick={() => setView(tab.view)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="tools">
          <button onClick={() => setHelp(true)} aria-label="키보드 단축키">
            ?
          </button>
          <button
            type="button"
            className="settings-button"
            lang="en"
            aria-label="setting"
            title="setting"
            aria-haspopup="dialog"
            disabled={!ready && !auth}
            onClick={() => {
              if (!auth) return edit("settings", settings);
              const theme = document.documentElement.dataset.theme;
              setDeleteStart(false);
              setEditor({
                id: "settings",
                version: 0,
                data: { ...defaults, theme: isTheme(theme) ? theme : defaultTheme },
              });
            }}
          >
            <Settings aria-hidden="true" size={19} strokeWidth={1.65} />
          </button>
        </div>
      </header>
      <main>
        <div className="mast">
          <div>
            <p className="eyebrow">
              {view === "todo"
                ? weekday(date)
                : view === "calendar"
                  ? "MONTHLY PLANNER"
                  : "GOAL JOURNAL"}{" "}
              <span>/</span> {year}
            </p>
            <h1>
              {view === "todo"
                ? date.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })
                : view === "goals" && scope !== "month"
                  ? year
                  : date.toLocaleDateString("en-US", { month: "long" })}
              <em>.</em>
            </h1>
          </div>
          <div className="navigate">
            <button
              className="period-arrow"
              aria-label={view === "todo" ? "이전 날" : "이전 기간"}
              onClick={() => turn(-1)}
            >
              <svg
                aria-hidden="true"
                width="7"
                height="10"
                viewBox="0 0 7 10"
                fill="currentColor"
              >
                <path d="M4.4 0H7L2.6 5 7 10H4.4L0 5Z" />
              </svg>
            </button>
            <button
              className="period-arrow"
              aria-label={view === "todo" ? "다음 날" : "다음 기간"}
              onClick={() => turn(1)}
            >
              <svg
                aria-hidden="true"
                width="7"
                height="10"
                viewBox="0 0 7 10"
                fill="currentColor"
              >
                <path d="M2.6 0H0L4.4 5 0 10H2.6L7 5Z" />
              </svg>
            </button>
            <button className="plain today-link" onClick={() => go(today)}>
              오늘
            </button>
          </div>
        </div>
        {auth && (
          <p className="notice">
            <a href="/signin-with-chatgpt?return_to=/" target="_top">
              내 계정으로 로그인
            </a>
          </p>
        )}
        {view === "calendar" && (
          <div className="spread">
            <section className="calendar-panel glass-panel" aria-label="월간 달력">
              <div className="week" lang="en">
                {weekdays.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <MonthGrid
                day={day}
                today={today}
                cells={cells}
                events={events}
                ready={ready}
                color={filter[0] ?? 0}
                onSelect={go}
                onEdit={(r) => edit(r.id, r.data)}
                onChanged={refresh}
              />
              <div className="filters">
                <div className="sectionhead">
                  <h3>색상 필터</h3>
                  <button className="plain" onClick={() => setFilter([])}>
                    전체 보기
                  </button>
                </div>
                <div className="colorchoices">
                  {palette.map((p, i) => (
                    <button
                      key={i}
                      aria-label={`색상 ${i + 1} 필터`}
                      aria-pressed={filter.includes(i)}
                      onClick={() =>
                        setFilter(
                          filter.includes(i)
                            ? filter.filter((v) => v !== i)
                            : [...filter, i],
                        )
                      }
                    >
                      <i style={{ backgroundColor: p }} />
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <aside className="daily-panel glass-panel">
              <p className="eyebrow">DAILY LOG</p>
              <h2 className="dayhead">
                {date.getMonth() + 1}월 {date.getDate()}일
              </h2>
              <p className="weekday">{weekday(date)}</p>
              <div className="sectionhead">
                <h3 lang="en">Agenda</h3>
                <button
                  className="plain log-add"
                  aria-label="선택한 날짜에 일정 추가"
                  title="일정 추가"
                  disabled={!ready}
                  onClick={add}
                >
                  +
                </button>
              </div>
              <div className="agenda">
                {daily.map((r) => (
                  <button
                    key={r.id}
                    data-event={r.id}
                    onClick={() => edit(r.id, r.data)}
                  >
                    <i style={{ backgroundColor: palette[r.data.color] }} />
                    <span>{r.data.title}</span>
                    <time>{r.data.time || "종일"}</time>
                  </button>
                ))}
              </div>
              <div className="sectionhead ruled">
                <h3 lang="en">Journal</h3>
                <button
                  className="plain log-add"
                  aria-label={note ? "하루 기록 편집" : "하루 기록 추가"}
                  title={note ? "하루 기록 편집" : "하루 기록 추가"}
                  disabled={!ready}
                  onClick={() =>
                    edit("note-" + day, { kind: "note", day, text: "" })
                  }
                >
                  +
                </button>
              </div>
              {note?.kind === "note" && <p className="note">{note.text}</p>}
              <button
                className="goaljump"
                aria-expanded={monthGoalsOpen}
                aria-controls="calendar-month-goals"
                onClick={() => setMonthGoalsOpen((open) => !open)}
              >
                이 달의 목표
              </button>
              <section
                id="calendar-month-goals"
                hidden={!monthGoalsOpen}
                aria-label={month + " 월간 목표"}
              >
                {ready ? (
                  <>
                    <GoalList goals={slots} ready={ready} onEdit={openGoal} />
                    <GoalScore goals={slots} weights={settings.weights} />
                  </>
                ) : (
                  <p className="muted">{status}</p>
                )}
              </section>
            </aside>
          </div>
        )}
        {view === "goals" && (
          <section className={overview ? "goals overview" : "goals"}>
            <div className="sectionhead">
              <div className="switches">
                {(["month", "overview", "year"] as const).map((s) => (
                  <button
                    key={s}
                    aria-pressed={scope === s}
                    onClick={() => setScope(s)}
                  >
                    {s === "month"
                      ? "월간 목표"
                      : s === "overview"
                        ? "월간 목표 모아보기"
                        : "연간 목표"}
                  </button>
                ))}
              </div>
            </div>
            {overview ? (
              ready ? (
                <div className="months" aria-label={year + "년 월간 목표"}>
                  {Array.from({ length: 12 }, (_, i) => {
                    const monthPeriod =
                      year + "-" + String(i + 1).padStart(2, "0");
                    const goals = goalSlots(monthPeriod);
                    const empty = goals.find((g) => !g.title);
                    return (
                      <section
                        className="month-summary"
                        key={monthPeriod}
                        aria-label={i + 1 + "월 목표"}
                      >
                        <h2>{i + 1}월</h2>
                        <ol>
                          {goals
                            .filter((g) => g.title)
                            .map((g) => (
                              <li key={g.slot}>
                                <button onClick={() => openGoal(g)}>
                                  <span>{g.title}</span>
                                  <b aria-label={g.mark || "미평가"}>
                                    {g.mark || "·"}
                                  </b>
                                </button>
                              </li>
                            ))}
                        </ol>
                        {empty && (
                          <button
                            className="plain"
                            aria-label={i + 1 + "월 목표 추가"}
                            onClick={() => openGoal(empty)}
                          >
                            ＋ 목표 추가
                          </button>
                        )}
                        <GoalScore goals={goals} weights={settings.weights} />
                      </section>
                    );
                  })}
                </div>
              ) : (
                <p className="muted" role="status">
                  {status}
                </p>
              )
            ) : (
              <>
                <p className="muted">
                  {period} ·{" "}
                  {marks
                    .slice(1)
                    .map((m, i) => m + " " + settings.weights[i] + "점")
                    .join("　")}
                </p>
                <GoalList goals={slots} ready={ready} onEdit={openGoal} />
                <GoalScore goals={slots} weights={settings.weights} />
              </>
            )}
          </section>
        )}
        {!auth && (
          <TodoDay
            hidden={view !== "todo"}
            day={day}
            items={rows}
            ready={ready}
            onEdit={(r) => edit(r.id, r.data)}
            onChanged={refresh}
          />
        )}
        <div className="foot">
          <button className="plain" onClick={() => void refresh()}>
            {status}
          </button>
          <button className="plain" onClick={() => setHelp(true)}>
            키보드 단축키 <kbd>?</kbd>
          </button>
        </div>
      </main>
      {editor && (
        <Editor
          item={editor}
          initialDelete={deleteStart}
          settings={settings}
          localOnly={auth}
          onPreview={setPreviewTheme}
          onClose={() => {
            setPreviewTheme(null);
            setEditor(null);
            void refresh();
          }}
          onSaved={(record) => {
            if (record?.kind === "settings") setSavedTheme(record.theme ?? defaultTheme);
            setPreviewTheme(null);
            setEditor(null);
            void refresh();
          }}
        />
      )}
      {help && <Help close={() => setHelp(false)} />}
    </>
  );
}
