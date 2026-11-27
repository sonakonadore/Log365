"use client";
import { useState, type KeyboardEvent } from "react";
import {
  defaultTheme,
  marks,
  themeNames,
  type Entry,
  type Theme,
} from "../lib/diary";
import { GoogleSettings } from "./google-calendar";
import { DeviceNotifications } from "./reminder-fields";

type Settings = Extract<Entry, { kind: "settings" }>;
const sections = ["화면 테마", "알림·배점", "Google Calendar"] as const;

export function SettingsFields({
  data,
  onChange,
  onPreview,
  localOnly,
}: {
  data: Settings;
  onChange: (value: Settings) => void;
  onPreview: (theme: Theme) => void;
  localOnly: boolean;
}) {
  const [tab, setTab] = useState(0);

  function selectTab(button: HTMLButtonElement, index: number) {
    const invalid = button.form?.querySelector<HTMLInputElement>("input:invalid");
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    setTab(index);
    button.focus();
  }

  function switchTab(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? sections.length-1 : (tab+sections.length+(e.key==="ArrowLeft"?-1:1))%sections.length;
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    selectTab(buttons[next], next);
  }

  return (
    <>
      {!localOnly && (
        <div className="settings-tabs" role="tablist" aria-label="setting" onKeyDown={switchTab}>
          {sections.map((label, index) => (
            <button
              key={label}
              id={"settings-tab-" + index}
              role="tab"
              type="button"
              aria-selected={tab === index}
              tabIndex={tab === index ? 0 : -1}
              aria-controls={"settings-pane-" + index}
              onClick={(e) => selectTab(e.currentTarget, index)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div
        id="settings-pane-0"
        hidden={tab !== 0}
        role={localOnly ? "group" : "tabpanel"}
        aria-label={localOnly ? "화면 테마" : undefined}
        aria-labelledby={localOnly ? undefined : "settings-tab-0"}
      >
        <fieldset className="theme-options">
          <legend className={localOnly ? "fieldname" : "sr-only"}>화면 테마</legend>
          {(Object.keys(themeNames) as Theme[]).map((theme) => (
            <label className="theme-choice" key={theme}>
              <span className="theme-sample" data-theme={theme} aria-hidden="true" />
              <span lang="en">{themeNames[theme]}</span>
              <input
                type="radio"
                name="appearance"
                value={theme}
                checked={(data.theme ?? defaultTheme) === theme}
                onChange={() => {
                  onChange({ ...data, theme });
                  onPreview(theme);
                }}
              />
            </label>
          ))}
        </fieldset>
      </div>
      {!localOnly && (
        <div id="settings-pane-1" role="tabpanel" aria-labelledby="settings-tab-1" hidden={tab !== 1}>
          <DeviceNotifications />
          <div className="fieldname">목표 배점 · 모든 기간에 적용</div>
          <div className="fields">
            {marks.slice(1).map((mark, i) => (
              <label key={mark}>
                {mark}
                <input
                  type="number"
                  required
                  min={0}
                  max={100}
                  value={data.weights[i]}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      weights: data.weights.map((value, j) => i === j ? Number(e.target.value) : value),
                    })
                  }
                />
              </label>
            ))}
          </div>
        </div>
      )}
      {!localOnly && <div id="settings-pane-2" role="tabpanel" aria-labelledby="settings-tab-2" hidden={tab!==2}>
        {tab===2 && <GoogleSettings />}
      </div>}
    </>
  );
}
