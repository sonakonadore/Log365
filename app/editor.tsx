"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { defaults, marks, palette, type Entry, type Item, type Theme } from "../lib/diary";
import { SettingsFields } from "./settings-fields";
import { ReminderField } from "./reminder-fields";
import { RepeatFields } from "./repeat-fields";

export async function saveRecord(
  item: Pick<Item, "id" | "version">,
  data: Entry | null,
) {
  const res = await fetch("/api/diary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: item.id, version: item.version, data }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error || "저장하지 못했습니다. 연결을 확인해 주세요.",
    );
  }
}

export function useEnterToSubmit() {
  const enterTarget = useRef<EventTarget | null>(null);
  return {
    onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
      if (e.key !== "Enter" && e.code !== "Enter" && e.code !== "NumpadEnter")
        return;
      const target = e.target;
      if (
        !(target instanceof HTMLElement) ||
        !target.matches('input, button[aria-pressed="true"]')
      )
        return;
      if (!e.repeat) enterTarget.current = target;
      // Let the IME commit the last syllable before reading the form on keyup.
      if (!e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229)
        e.preventDefault();
    },
    onKeyUp(e: KeyboardEvent<HTMLFormElement>) {
      if (e.key !== "Enter" && e.code !== "Enter" && e.code !== "NumpadEnter")
        return;
      const pending = enterTarget.current;
      enterTarget.current = null;
      if (pending !== e.target || e.nativeEvent.isComposing) return;
      e.preventDefault();
      e.currentTarget.requestSubmit();
    },
  };
}

export function EventColors({
  value,
  onChange,
}: {
  value: number;
  onChange: (color: number) => void;
}) {
  return (
    <div className="colorchoices" role="group" aria-label="일정 색상">
      {palette.map((p, i) => (
        <button
          type="button"
          key={p}
          aria-label={`색상 ${i + 1} 선택`}
          aria-pressed={i === value}
          onClick={(e) => {
            e.currentTarget.focus({ preventScroll: true });
            onChange(i);
          }}
        >
          <i style={{ backgroundColor: p }} />
        </button>
      ))}
    </div>
  );
}

export function Editor({
  item,
  settings,
  initialDelete,
  localOnly,
  onPreview,
  onClose,
  onSaved,
}: {
  item: Item;
  initialDelete: boolean;
  localOnly: boolean;
  onPreview: (theme: Theme) => void;
  settings: typeof defaults;
  onClose: () => void;
  onSaved: (record: Entry | null) => void;
}) {
  const [data, setData] = useState<Entry>(item.data);
  const enter = useEnterToSubmit();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(initialDelete);
  const dialog = useRef<HTMLDialogElement>(null);
  const enterSaves =
    !deleting && (data.kind === "event" || data.kind === "goal");
  const editingSeries = item.data.kind === "event" && !!item.data.repeat;
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current
      ?.querySelector<HTMLElement>(
        '[role="tab"][aria-selected="true"], input:not([type="radio"]), input:checked, textarea',
      )
      ?.focus();
  }, []);
  async function save(record: Entry | null) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!(localOnly && record?.kind === "settings")) await saveRecord(item, record);
      onSaved(record);
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  const title =
    data.kind === "event"
      ? item.version
        ? editingSeries
          ? "반복 일정 전체 편집"
          : "일정 편집"
        : "일정 추가"
      : data.kind === "todo"
        ? "할 일 편집"
        : data.kind === "goal"
          ? "목표 기록"
          : data.kind === "note"
            ? "Journal"
            : "setting";
  return (
    <dialog
      ref={dialog}
      aria-labelledby="editor-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (enterSaves) {
            const fields = new FormData(e.currentTarget);
            const title = String(fields.get("title") ?? "").trim();
            if (!title) return;
            void save(
              data.kind === "event"
                ? { ...data, title, time: String(fields.get("time") ?? "") }
                : { ...data, title },
            );
          } else void save(deleting ? null : data);
        }}
        onKeyDown={(e) => {
          if (enterSaves && !e.metaKey && !e.ctrlKey) {
            enter.onKeyDown(e);
            return;
          }
          if (e.nativeEvent.isComposing) return;
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }
        }}
        onKeyUp={enterSaves ? enter.onKeyUp : undefined}
      >
        <div className="sectionhead">
          <h2 id="editor-title" lang={data.kind === "settings" ? "en" : undefined}>
            {deleting
              ? editingSeries
                ? "반복 일정 전체를 삭제할까요?"
                : "이 기록을 삭제할까요?"
              : title}
          </h2>
          <button
            type="button"
            aria-label="닫기"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <fieldset disabled={busy}>
          {deleting ? (
            <p>저장된 기록이 다이어리에서 삭제됩니다.</p>
          ) : (
            <>
              {data.kind === "event" && (
                <>
                  <label>
                    일정 이름
                    <input
                      autoFocus
                      required
                      name="title"
                      enterKeyHint="done"
                      maxLength={160}
                      value={data.title}
                      onChange={(e) =>
                        setData({ ...data, title: e.target.value })
                      }
                    />
                  </label>
                  <div className="fields">
                    <label>
                      {editingSeries ? "첫 시작일" : "날짜"}
                      <input
                        type="date"
                        required
                        value={data.day}
                        onChange={(e) =>
                          setData({
                            ...data,
                            day: e.target.value,
                            endDay:
                              data.endDay && data.endDay < e.target.value
                                ? e.target.value
                                : data.endDay,
                          })
                        }
                      />
                    </label>
                    <label>
                      {editingSeries ? "첫 종료일" : "종료일"}
                      <input
                        type="date"
                        min={data.day}
                        value={data.endDay || data.day}
                        onChange={(e) =>
                          setData({
                            ...data,
                            endDay: e.target.value || undefined,
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="fields">
                    <label>
                      시작 시간 · 선택
                      <input
                        type="time"
                        name="time"
                        defaultValue={data.time}
                        onChange={(e) =>
                          setData({ ...data, time: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="fieldname">색상 분류</div>
                  <EventColors
                    value={data.color}
                    onChange={(color) => setData({ ...data, color })}
                  />
                  <ReminderField
                    value={data.reminder}
                    onChange={(reminder) => setData({ ...data, reminder })}
                  />
                  <RepeatFields
                    value={data.repeat}
                    onChange={(repeat) => setData({ ...data, repeat })}
                  />
                </>
              )}
              {data.kind === "todo" && (
                <label>
                  할 일
                  <input
                    required
                    maxLength={160}
                    value={data.title}
                    onChange={(e) =>
                      setData({ ...data, title: e.target.value })
                    }
                  />
                </label>
              )}
              {data.kind === "goal" && (
                <>
                  <label>
                    {data.period} · {data.slot + 1}번째 목표
                    <input
                      autoFocus
                      required
                      name="title"
                      enterKeyHint="done"
                      maxLength={160}
                      value={data.title}
                      onChange={(e) =>
                        setData({ ...data, title: e.target.value })
                      }
                    />
                  </label>
                  <div className="fieldname">평가</div>
                  <div className="switches">
                    {marks.map((m, i) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={data.mark === m}
                        onClick={(e) => {
                          e.currentTarget.focus({ preventScroll: true });
                          setData({ ...data, mark: m });
                        }}
                      >
                        {m
                          ? m + " " + settings.weights[i - 1] + "점"
                          : "미평가"}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {data.kind === "note" && (
                <label>
                  {data.day} · 오늘의 일과
                  <textarea
                    autoFocus
                    required
                    rows={7}
                    maxLength={6000}
                    value={data.text}
                    onChange={(e) => setData({ ...data, text: e.target.value })}
                  />
                </label>
              )}
              {data.kind === "settings" && (
                <SettingsFields
                  data={data}
                  onChange={setData}
                  onPreview={onPreview}
                  localOnly={localOnly}
                />
              )}
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <footer>
            {item.version > 0 && data.kind !== "settings" && !deleting && (
              <button type="button" onClick={() => setDeleting(true)}>
                삭제…
              </button>
            )}
            <button
              type="button"
              lang="en"
              onClick={deleting ? () => setDeleting(false) : onClose}
            >
              cancel
            </button>
            <button className="primary" type="submit" lang={deleting ? "ko" : "en"}>
              {deleting ? (busy ? "삭제 중…" : "삭제 확인") : (busy ? "saving…" : "save")}
            </button>
          </footer>
        </fieldset>
      </form>
    </dialog>
  );
}
