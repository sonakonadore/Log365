"use client";
import { frequencies, type Recurrence } from "../lib/diary";

export function RepeatFields({
  value,
  onChange,
}: {
  value?: Recurrence;
  onChange: (value?: Recurrence) => void;
}) {
  return (
    <div className="repeat-fields">
      <label>
        반복
        <select
          value={value?.frequency ?? ""}
          onChange={(e) => {
            const frequency = e.target.value as Recurrence["frequency"] | "";
            onChange(
              frequency
                ? { frequency, count: value?.count ?? null }
                : undefined,
            );
          }}
        >
          <option value="">반복 안 함</option>
          {Object.entries(frequencies).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {value && (
        <>
          <label>
            반복 종료
            <select
              value={value.count === null ? "never" : "count"}
              onChange={(e) =>
                onChange({
                  ...value,
                  count: e.target.value === "never" ? null : 2,
                })
              }
            >
              <option value="never">무기한</option>
              <option value="count">횟수 지정</option>
            </select>
          </label>
          {value.count !== null && (
            <label>
              총 횟수
              <input
                type="number"
                min={1}
                step={1}
                required
                value={value.count || ""}
                onChange={(e) =>
                  onChange({ ...value, count: e.target.valueAsNumber || 0 })
                }
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}
