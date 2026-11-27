"use client";
import { useEffect, useState } from "react";
import { reminderOptions, type Reminder } from "../lib/diary";

export function ReminderField({
  value,
  onChange,
}: {
  value?: Reminder;
  onChange: (reminder?: Reminder) => void;
}) {
  return (
    <div className="repeat-fields">
      <label>
        알림
        <select aria-label="알림"
          value={value?.minutes ?? ""}
          onChange={(e) =>
            onChange(
              e.target.value === ""
                ? undefined
                : {
                    minutes: Number(e.target.value),
                    zone:
                      value?.zone ??
                      Intl.DateTimeFormat().resolvedOptions().timeZone,
                  },
            )
          }
        >
          <option value="">없음</option>
          {reminderOptions.map(([minutes, label]) => (
            <option key={minutes} value={minutes}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {value && (
        <small className="reminder-hint">종일 일정은 오전 9시 기준</small>
      )}
    </div>
  );
}

async function deviceApi(
  action: string,
  subscription?: PushSubscription | null,
) {
  const res = await fetch("/api/reminders/device", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, subscription: subscription?.toJSON() }),
  });
  if (!res.ok)
    throw new Error(
      "기기 설정을 저장하지 못했어요. 로그인과 연결을 확인해 주세요.",
    );
  return res.json() as Promise<{ active: boolean; publicKey?: string }>;
}

export function DeviceNotifications() {
  const [state, setState] = useState<
    "loading" | "on" | "off" | "unavailable" | "denied"
  >("loading");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    async function check() {
      if (
        !(
          "Notification" in window &&
          "PushManager" in window &&
          "serviceWorker" in navigator
        )
      )
        return "unavailable" as const;
      if (Notification.permission === "denied") return "denied" as const;
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      return sub && (await deviceApi("status", sub)).active
        ? ("on" as const)
        : ("off" as const);
    }
    check()
      .then((v) => {
        if (live) setState(v);
      })
      .catch(() => {
        if (live) {
          setState("off");
          setMessage("기기 연결 상태를 확인해 주세요.");
        }
      });
    return () => {
      live = false;
    };
  }, []);
  async function toggle() {
    const disable = state === "on";
    setMessage("");
    setState("loading");
    try {
      if (!disable && (await Notification.requestPermission()) !== "granted") {
        setState(Notification.permission === "denied" ? "denied" : "off");
        return;
      }
      await navigator.serviceWorker.register("/reminder-sw.js", { scope: "/" });
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (disable) {
        if (sub) {
          await deviceApi("remove", sub);
          await sub.unsubscribe();
        }
        setState("off");
        return;
      }
      const { publicKey } = await deviceApi("key");
      if (!publicKey) throw new Error("푸시 연결을 설정할 수 없어요.");
      const decoded = Uint8Array.from(
        atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      if (sub && !(await deviceApi("status", sub)).active) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decoded,
      });
      await deviceApi("add", sub);
      setState("on");
    } catch (err) {
      setState(disable ? "on" : "off");
      setMessage(err instanceof Error ? err.message : "다시 시도해 주세요.");
    }
  }
  return (
    <div className="device-notifications">
      <div className="fieldname">이 기기의 일정 알림</div>
      {state === "unavailable" ? (
        <small>아이폰에서는 홈 화면에 추가한 Log365에서 켤 수 있어요.</small>
      ) : state === "denied" ? (
        <small>기기 설정에서 Log365의 알림을 허용해 주세요.</small>
      ) : (
        <button type="button" disabled={state === "loading"} onClick={toggle}>
          {state === "on"
            ? "이 기기 알림 끄기"
            : state === "loading"
              ? "확인 중…"
              : "이 기기 알림 켜기"}
        </button>
      )}
      {message && <small role="alert">{message}</small>}
    </div>
  );
}
