"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  movedEvent,
  occurrenceInRange,
  palette,
  type EventItem,
  type Recurrence,
  type Reminder,
} from "../lib/diary";
import { EventColors, saveRecord, useEnterToSubmit } from "./editor";
import { ReminderField } from "./reminder-fields";
import { RepeatFields } from "./repeat-fields";

type Gesture = {
  pointer: number;
  start: string;
  over: string;
  item?: EventItem;
  dragged: boolean;
};
type EventMove = { item: EventItem; from: string; to: string };
type Draft = {
  id: string;
  day: string;
  endDay: string;
  title: string;
  color: number;
  repeat?: Recurrence;
  reminder?: Reminder;
  left: number;
  top: number;
};
type Props = {
  day: string;
  today: string;
  cells: string[];
  events: EventItem[];
  ready: boolean;
  color: number;
  onSelect: (day: string) => void;
  onEdit: (item: EventItem) => void;
  onChanged: () => Promise<void>;
};

export function MonthGrid({
  day,
  today,
  cells,
  events,
  ready,
  color,
  onSelect,
  onEdit,
  onChanged,
}: Props) {
  const [preview, setPreview] = useState<[string, string] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingMove, setPendingMove] = useState<EventMove | null>(null);
  const moveDialog = useRef<HTMLDialogElement>(null);
  const enter = useEnterToSubmit();
  const gesture = useRef<Gesture | null>(null),
    suppressClick = useRef(false);
  const delayedSelect = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const touchInput = useRef(false);
  const lastTap = useRef({ day: "", time: 0 });
  const dialog = useRef<HTMLDialogElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(delayedSelect.current), [day]);
  useEffect(() => {
    if (pendingMove) moveDialog.current?.showModal();
  }, [pendingMove]);
  useEffect(() => {
    if (draft && !dialog.current?.open) {
      dialog.current?.showModal();
      dialog.current?.querySelector("input")?.focus();
    }
  }, [draft]);
  function quick(start: string, end: string) {
    if (!ready || busy) return;
    clearTimeout(delayedSelect.current);
    const [first, last] = [start, end].sort();
    const box = grid.current
      ?.querySelector('[data-day="' + start + '"]')
      ?.getBoundingClientRect();
    setError("");
    setDraft({
      id: "event-" + crypto.randomUUID(),
      day: first,
      endDay: last,
      title: "",
      color,
      left: box?.left ?? 12,
      top: (box?.top ?? 0) + 26,
    });
    onSelect(first);
  }
  async function create(fields: FormData) {
    const title = String(fields.get("title") ?? "").trim();
    if (!draft || busy || !title) return;
    setBusy(true);
    setError("");
    try {
      await saveRecord(
        { id: draft.id, version: 0 },
        {
          kind: "event",
          day: draft.day,
          endDay: draft.endDay,
          title,
          time: String(fields.get("time") ?? ""),
          color: draft.color,
          repeat: draft.repeat,
          reminder: draft.reminder,
        },
      );
      setDraft(null);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  function down(e: PointerEvent<HTMLButtonElement>, date: string) {
    if (
      e.button !== 0 ||
      e.pointerType === "touch" ||
      !e.isPrimary ||
      !ready ||
      busy
    )
      return;
    const chip = (e.target as Element).closest<HTMLElement>("[data-chip]");
    gesture.current = {
      pointer: e.pointerId,
      start: date,
      over: date,
      item: events.find((r) => r.id === chip?.dataset.chip),
      dragged: false,
    };
    suppressClick.current = false;
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function cellAt(e: PointerEvent) {
    const cell = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-day]");
    return cell && grid.current?.contains(cell) ? cell.dataset.day : undefined;
  }
  function move(e: PointerEvent) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointer) return;
    const next = cellAt(e);
    if (!next || next === g.over) return;
    g.dragged = true;
    g.over = next;
    if (g.item) {
      const range = occurrenceInRange(g.item.data, g.start, g.start);
      const moved = movedEvent({ ...g.item.data, ...range }, g.start, next);
      setPreview([moved.day, moved.endDay ?? moved.day]);
    } else setPreview([g.start, next].sort() as [string, string]);
  }
  function finish(e: PointerEvent) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointer) return;
    const dest = cellAt(e);
    gesture.current = null;
    setPreview(null);
    if (!g.dragged && (!dest || dest === g.start)) return;
    suppressClick.current = true;
    clearTimeout(delayedSelect.current);
    if (!dest || dest === g.start) return;
    if (!g.item) {
      quick(g.start, dest);
      return;
    }
    const change = { item: g.item, from: g.start, to: dest };
    if (g.item.data.repeat) setPendingMove(change);
    else void saveMove(change);
  }
  async function saveMove({ item, from, to }: EventMove) {
    setBusy(true);
    setError("");
    try {
      const range = occurrenceInRange(item.data, from, from);
      await saveRecord(item, movedEvent(item.data, from, to, range?.day));
      onSelect(to);
    } catch (e) {
      setError(e instanceof Error ? e.message : "일정을 이동하지 못했습니다.");
    } finally {
      await onChanged();
      setBusy(false);
    }
  }
  return (
    <>
      <div
        ref={grid}
        className="grid"
        aria-label="날짜 선택"
        onKeyDownCapture={(e) => {
          if (e.key.startsWith("Arrow")) clearTimeout(delayedSelect.current);
        }}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={() => {
          gesture.current = null;
          setPreview(null);
        }}
        onLostPointerCapture={() => {
          gesture.current = null;
          setPreview(null);
        }}
      >
        {cells.map((s) => {
          const entries = events.flatMap((r) => {
            const range = occurrenceInRange(r.data, s, s);
            return range ? [{ ...r, range }] : [];
          });
          const outside = s.slice(0, 7) !== day.slice(0, 7);
          return (
            <button
              key={s}
              data-day={s}
              tabIndex={s === day ? 0 : -1}
              aria-label={s + " 일정 " + entries.length + "개"}
              aria-current={s === today ? "date" : undefined}
              aria-pressed={s === day}
              data-range={
                (preview && preview[0] <= s && s <= preview[1]) || undefined
              }
              className={outside ? "outside" : ""}
              onPointerDown={(e) => {
                touchInput.current = e.pointerType === "touch";
                down(e, s);
              }}
              onClick={(e) => {
                if (e.detail && suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                const chip = (e.target as Element).closest<HTMLElement>(
                  "[data-chip]",
                );
                const item = entries.find((r) => r.id === chip?.dataset.chip);
                if (item) {
                  lastTap.current.day = "";
                  onEdit(item);
                  return;
                }
                clearTimeout(delayedSelect.current);
                if (touchInput.current && e.detail) {
                  const now = performance.now();
                  if (
                    lastTap.current.day === s &&
                    now - lastTap.current.time <= 400
                  ) {
                    lastTap.current.day = "";
                    quick(s, s);
                    return;
                  }
                  lastTap.current = { day: s, time: now };
                }
                e.currentTarget.focus({ preventScroll: true });
                if (outside && e.detail)
                  delayedSelect.current = setTimeout(() => onSelect(s), 400);
                else onSelect(s);
              }}
              onDoubleClick={(e) => {
                if (
                  !touchInput.current &&
                  !(e.target as Element).closest("[data-chip]")
                ) {
                  e.preventDefault();
                  quick(s, s);
                }
              }}
            >
              <span className="num">{Number(s.slice(-2))}</span>
              <span className="chips">
                {entries.slice(0, 2).map((r) => {
                  const multi = !!r.data.endDay && r.data.endDay !== r.data.day;
                  return (
                    <span
                      className={multi ? "chip span-event" : "chip"}
                      key={r.id}
                      data-chip={r.id}
                      title={
                        multi
                          ? r.data.title +
                            " · " +
                            r.range.day +
                            " ~ " +
                            r.range.endDay
                          : r.data.title
                      }
                      style={
                        multi
                          ? { backgroundColor: palette[r.data.color] + "45" }
                          : undefined
                      }
                    >
                      <i style={{ backgroundColor: palette[r.data.color] }} />
                      <span>{r.data.title}</span>
                    </span>
                  );
                })}
                {entries.length > 2 && <small>+{entries.length - 2}</small>}
              </span>
            </button>
          );
        })}
      </div>
      {error && !draft && <p role="alert">{error}</p>}
      {pendingMove && (
        <dialog
          ref={moveDialog}
          aria-labelledby="move-series-title"
          onClose={(e) => {
            if (e.currentTarget.returnValue === "save") void saveMove(pendingMove);
            setPendingMove(null);
          }}
        >
          <form method="dialog">
            <h2 id="move-series-title">반복 일정 전체를 이동할까요?</h2>
            <footer>
              <button lang="en" value="cancel">cancel</button>
              <button lang="en" className="primary" value="save" autoFocus>save</button>
            </footer>
          </form>
        </dialog>
      )}
      {draft && (
        <dialog
          className="quick-event"
          ref={dialog}
          aria-label="빠른 일정 추가"
          style={
            {
              left: `clamp(8px, ${draft.left}px, max(8px, 100vw - 310px))`,
              "--anchor-top": `${draft.top}px`,
            } as CSSProperties
          }
          onCancel={(e) => {
            e.preventDefault();
            if (!busy) {
              setDraft(null);
              setError("");
            }
          }}
        >
          <form
            {...enter}
            onSubmit={(e) => {
              e.preventDefault();
              void create(new FormData(e.currentTarget));
            }}
          >
            <div className="sectionhead">
              <span>
                {draft.day}
                {draft.endDay !== draft.day ? " ~ " + draft.endDay : ""}
              </span>
              <button
                type="button"
                disabled={busy}
                aria-label="닫기"
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
              >
                ×
              </button>
            </div>
            <input
              value={draft.title}
              aria-label="일정 이름"
              name="title"
              enterKeyHint="done"
              placeholder="일정 이름"
              required
              maxLength={160}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <label>
              시작 시간 · 선택
              <input type="time" name="time" />
            </label>
            <div className="fieldname">색상</div>
            <EventColors
              value={draft.color}
              onChange={(color) => setDraft({ ...draft, color })}
            />
            <ReminderField
              value={draft.reminder}
              onChange={(reminder) => setDraft({ ...draft, reminder })}
            />
            <RepeatFields
              value={draft.repeat}
              onChange={(repeat) => setDraft({ ...draft, repeat })}
            />
            {error && <p role="alert">{error}</p>}
            <button className="primary" lang="en" aria-keyshortcuts="Enter" disabled={busy || !draft.title.trim()}>
              {busy ? "saving…" : "save"}
            </button>
          </form>
        </dialog>
      )}
    </>
  );
}
