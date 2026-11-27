"use client";
import { useState } from "react";
import { marks, type Item } from "../lib/diary";
import { saveRecord } from "./editor";

type Draft = { text: string; version: number };
export function TodoDay({
  day,
  items,
  ready,
  hidden,
  onEdit,
  onChanged,
}: {
  day: string;
  items: Item[];
  ready: boolean;
  hidden: boolean;
  onEdit: (item: Item) => void;
  onChanged: () => Promise<void>;
}) {
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [memos, setMemos] = useState<Record<string, Draft | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState({ day: "", message: "" });
  const tasks = items
    .filter((r) => r.data.kind === "todo" && r.data.day === day)
    .sort((a, b) => a.id.localeCompare(b.id));
  const noteId = "note-" + day;
  const note = items.find((r) => r.id === noteId);
  const savedText = note?.data.kind === "note" ? note.data.text : "";
  const draft = memos[day];
  const title = titles[day] ?? "";
  const locked = busy || !ready;
  async function write(action: () => Promise<void>, after?: () => void) {
    if (locked) return;
    setBusy(true);
    setFailure({ day, message: "" });
    try {
      await action();
      after?.();
    } catch (e) {
      setFailure({
        day,
        message: e instanceof Error ? e.message : "저장하지 못했습니다.",
      });
    } finally {
      await onChanged();
      setBusy(false);
    }
  }
  function discardMemo() {
    setMemos((prev) => ({ ...prev, [day]: undefined }));
  }
  return (
    <section hidden={hidden} aria-label="날짜별 할 일과 메모">
      <div className="todo-page">
        <section>
          <h2 lang="en">to-do</h2>
          <ul className="task-list">
            {tasks.map((item) => {
              const task = item.data;
              if (task.kind !== "todo") return null;
              return (
                <li key={item.id}>
                  <button
                    className="task-title"
                    disabled={locked}
                    onClick={() => onEdit(item)}
                  >
                    {task.title}
                  </button>
                  <div
                    className="task-marks"
                    role="group"
                    aria-label={task.title + " 평가"}
                  >
                    {marks.slice(1).map((mark) => (
                      <button
                        key={mark}
                        aria-pressed={task.mark === mark}
                        disabled={locked}
                        onClick={() =>
                          void write(() =>
                            saveRecord(item, {
                              ...task,
                              mark: task.mark === mark ? "" : mark,
                            }),
                          )
                        }
                      >
                        {mark}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft) return;
            const data = draft.text.trim()
              ? { kind: "note" as const, day, text: draft.text }
              : null;
            if (!data && !draft.version) {
              discardMemo();
              return;
            }
            void write(
              () => saveRecord({ id: noteId, version: draft.version }, data),
              discardMemo,
            );
          }}
        >
          <h2>
            <label htmlFor="daily-memo" lang="en">
              memo
            </label>
          </h2>
          <textarea
            id="daily-memo"
            rows={8}
            maxLength={6000}
            disabled={locked}
            value={draft?.text ?? savedText}
            onChange={(e) =>
              setMemos({
                ...memos,
                [day]: {
                  text: e.target.value,
                  version: draft?.version ?? note?.version ?? 0,
                },
              })
            }
            onKeyDown={(e) => {
              if (
                !e.nativeEvent.isComposing &&
                (e.metaKey || e.ctrlKey) &&
                e.key === "Enter"
              ) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          {draft && (
            <div className="memo-actions">
              <button type="button" lang="en" disabled={locked} onClick={discardMemo}>
                cancel
              </button>
              <button className="primary" lang="en" disabled={locked}>
                save
              </button>
            </div>
          )}
        </form>
        <form
          className="task-entry"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            const id = "todo-" + Date.now() + "-" + crypto.randomUUID();
            void write(
              () =>
                saveRecord(
                  { id, version: 0 },
                  {
                    kind: "todo",
                    day,
                    title: title.trim(),
                    mark: "",
                  },
                ),
              () => setTitles((prev) => ({ ...prev, [day]: "" })),
            );
          }}
        >
          <input
            aria-label="새 할 일"
            required
            maxLength={160}
            value={title}
            disabled={!ready}
            readOnly={busy}
            onChange={(e) => setTitles({ ...titles, [day]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.nativeEvent.isComposing)
                e.preventDefault();
            }}
          />
          <button disabled={locked || !title.trim()}>추가</button>
        </form>
      </div>
      {failure.day === day && failure.message && (
        <p role="alert">{failure.message}</p>
      )}
    </section>
  );
}
