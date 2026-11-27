"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  displayEvent,
  type EventFields,
  type GoogleEvent,
} from "../lib/google/events";

export type Connection = {
  configured: boolean;
  connected: boolean;
  calendarId: string | null;
  generation?: string;
  testing: boolean;
};
const offline: Connection = {
  configured: false,
  connected: false,
  calendarId: null,
  testing: true,
};
export async function calendarApi<T>(query: string, body?: object): Promise<T> {
  const res = await fetch("/api/google-calendar" + query, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await res.json().catch(() => null);
  if (!res.ok || result === null)
    throw new Error(
      (result as { error?: string } | null)?.error ??
        "Google 연결 상태를 확인할 수 없어요. 새로고침해 주세요.",
    );
  return result as T;
}
const message = (err: unknown) =>
  err instanceof Error ? err.message : "Google Calendar에 연결할 수 없어요.";
export function useGoogleCalendar(month: string, enabled: boolean) {
  const [state, setState] = useState<Connection | null>(null);
  const [batch, setBatch] = useState<{
    month: string;
    generation?: string;
    items: GoogleEvent[];
  } | null>(null);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const ticket = ++seq.current;
    if (!enabled || !month) {
      setState(null);
      setBatch(null);
      setError("");
      return;
    }
    let connectionChecked = false;
    try {
      const s = await calendarApi<Connection>("?op=state");
      if (seq.current !== ticket) return;
      connectionChecked = true;
      setState(s);
      if (!s.calendarId) {
        setBatch(null);
        setError("");
        return;
      }
      const params = new URLSearchParams({
        op: "events",
        month,
        calendarId: s.calendarId,
      });
      const items = await calendarApi<GoogleEvent[]>("?" + params);
      if (seq.current === ticket) {
        setBatch({ month, generation: s.generation, items });
        setError("");
      }
    } catch (err) {
      if (seq.current === ticket) {
        if (!connectionChecked) setState(null);
        setBatch(null);
        setError(message(err));
      }
    }
  }, [month, enabled]);
  useEffect(() => {
    void refresh();
    const back = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      seq.current++;
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [refresh]);
  const items =
    enabled &&
    state &&
    batch?.month === month &&
    batch.generation === state.generation
      ? batch.items.map(displayEvent)
      : [];
  return {
    state: (enabled && state) || offline,
    readyToCreate: enabled && state !== null,
    items,
    error,
    refresh,
  };
}
export const GoogleContext = createContext<ReturnType<
  typeof useGoogleCalendar
> | null>(null);
export function GoogleSettings() {
  const google = useContext(GoogleContext)!;
  const { state, refresh } = google;
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setOptions([]);
    setError("");
    if (state.connected)
      calendarApi<{ id: string; name: string }[]>("?op=calendars")
        .then((x) => {
          if (live) setOptions(x);
        })
        .catch((e) => {
          if (live) setError(message(e));
        });
    return () => {
      live = false;
    };
  }, [state.connected, state.generation]);
  async function action(op: string, calendarId?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await calendarApi<{ url?: string }>("", {
        op,
        generation: state.generation,
        calendarId,
      });
      if (op === "connect" && r.url) {
        window.location.assign(r.url);
        return;
      }
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="google-settings">
      <a className="privacy-link" href="/privacy">개인정보처리방침</a>
      {!state.configured ? (
        <p>Google Calendar 연결 설정을 준비 중이에요.</p>
      ) : !state.connected ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void action("connect")}
        >
          Google 계정 연결
        </button>
      ) : (
        <>
          <label>
            대상 캘린더
            <select
              disabled={busy}
              value={state.calendarId ?? ""}
              onChange={(e) => void action("select", e.target.value)}
            >
              <option value="" disabled>
                캘린더 선택
              </option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {state.testing && (
            <p>
              테스트 일정 두 건만 표시할 수 있어요. 시간 일정 한 건과 종일 일정
              한 건이에요.
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void action("disconnect")}
          >
            연결 해제
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export type GoogleDraft = {
  calendarId: string;
  generation: string;
  day: string;
  last: string;
  event?: GoogleEvent;
  deleting?: boolean;
};
export function GoogleEditor({
  draft,
  close,
  local,
}: {
  draft: GoogleDraft;
  close: () => void;
  local: (f: EventFields) => void;
}) {
  const { state, refresh } = useContext(GoogleContext)!;
  const ref = useRef<HTMLDialogElement>(null),
    requestId = useRef(crypto.randomUUID().replaceAll("-", ""));
  const event = draft.event;
  const [fields, setFields] = useState<EventFields>(
    event ?? {
      title: state.testing ? "Log365 연동 테스트" : "",
      allDay: true,
      day: draft.day,
      endDay: draft.last,
      start: "09:00",
      end: "10:00",
    },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(!!draft.deleting && !event?.readOnly);
  const pending = useRef(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  function change<K extends keyof EventFields>(key: K, v: EventFields[K]) {
    setFields((f) => ({ ...f, [key]: v }));
  }
  function readForm(form: HTMLFormElement): EventFields {
    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? "");
    return {
      title: text("title"),
      day: text("day"),
      endDay: text("endDay"),
      allDay: data.has("allDay"),
      start: text("start"),
      end: text("end"),
    };
  }
  async function submit(form: HTMLFormElement) {
    if (pending.current || event?.readOnly) return;
    const submitted = deleting ? undefined : readForm(form);
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await calendarApi("", {
        op: deleting ? "delete" : event ? "update" : "create",
        calendarId: draft.calendarId,
        generation: draft.generation,
        eventId: event?.eventId,
        etag: event?.etag,
        draft: submitted,
        requestId: requestId.current,
      });
      await refresh();
      close();
    } catch (e) {
      setError(message(e));
      await refresh();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="google-event-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <div className="sectionhead">
          <h2 id="google-event-title">
            {deleting ? "Google 일정을 삭제할까요?" : "Google Calendar"}
          </h2>
          <button
            type="button"
            aria-label="닫기"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
        </div>
        {!deleting && (
          <fieldset disabled={busy || event?.readOnly}>
            <label>
              일정 이름
              <input
                autoFocus
                name="title"
                required
                maxLength={256}
                value={fields.title}
                onChange={(e) => change("title", e.target.value)}
              />
            </label>
            <label className="google-allday">
              <input
                type="checkbox"
                name="allDay"
                checked={fields.allDay}
                onChange={(e) =>
                  setFields((f) => ({
                    ...f,
                    allDay: e.target.checked,
                    start: f.start || "09:00",
                    end: f.end || "10:00",
                  }))
                }
              />
              종일
            </label>
            <div className="fields">
              <label>
                시작 날짜
                <input
                  type="date"
                  name="day"
                  required
                  value={fields.day}
                  onChange={(e) =>
                    setFields((f) => ({
                      ...f,
                      day: e.target.value,
                      endDay:
                        e.target.value > f.endDay ? e.target.value : f.endDay,
                    }))
                  }
                />
              </label>
              <label>
                종료 날짜
                <input
                  type="date"
                  name="endDay"
                  required
                  min={fields.day}
                  value={fields.endDay}
                  onChange={(e) => change("endDay", e.target.value)}
                />
              </label>
            </div>
            {!fields.allDay && (
              <>
                <div className="fields">
                  <label>
                    시작 시간
                    <input
                      type="time"
                      name="start"
                      required
                      value={fields.start}
                      onChange={(e) => change("start", e.target.value)}
                    />
                  </label>
                  <label>
                    종료 시간
                    <input
                      type="time"
                      name="end"
                      required
                      value={fields.end}
                      onChange={(e) => change("end", e.target.value)}
                    />
                  </label>
                </div>
                <small>서울 시간</small>
              </>
            )}
          </fieldset>
        )}
        {event?.readOnly && <p>읽기 전용 일정이에요.</p>}
        {error && <p role="alert">{error}</p>}
        <footer>
          {!event && (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                if (e.currentTarget.form) local(readForm(e.currentTarget.form));
              }}
            >
              Log365에 쓰기
            </button>
          )}
          {event && !event.readOnly && !deleting && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeleting(true)}
            >
              삭제…
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={deleting ? () => setDeleting(false) : close}
          >
            cancel
          </button>
          {!event?.readOnly && (
            <button className="primary" disabled={busy}>
              {deleting ? "삭제 확인" : busy ? "saving…" : "save"}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}
