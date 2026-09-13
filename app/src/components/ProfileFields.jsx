import React from "react";
import { DISTANCES, REFUSABLE, TYPE_META, WEEKDAYS } from "../data/store.js";
import { Lock } from "./Icons.jsx";

export const EMPTY_PROFILE = {
  name: "",
  capacity: 70,
  distance_km: 10,
  days_off: [],
  refuses: [],
  private_reason: "",
};

/** The profile as the API wants it. */
export function toProfile(values) {
  return {
    name: values.name.trim(),
    capacity: values.capacity / 100,
    distance_km: values.distance_km,
    days_off: values.days_off,
    refuses: values.refuses,
    private_reason: values.private_reason.trim(),
  };
}

function toggled(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Everything a person tells Shoulder about themselves when they arrive.
 * Used by both "create a family" and "join a family", so the two can never
 * ask different questions.
 */
export default function ProfileFields({ values, onChange }) {
  const set = (key, value) => onChange({ ...values, [key]: value });

  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="profile-name">
          Your name
        </label>
        <input
          id="profile-name"
          className="input"
          value={values.name}
          maxLength={80}
          autoComplete="name"
          autoFocus
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="profile-capacity">
          How much of the care you can take on
        </label>
        <div className="range-row">
          <input
            id="profile-capacity"
            className="range"
            type="range"
            min="20"
            max="100"
            step="5"
            value={values.capacity}
            onChange={(e) => set("capacity", Number(e.target.value))}
          />
          <span className="range-value">{values.capacity}%</span>
        </div>
        <span className="field-hint">Your share of the load is measured against this, not split evenly.</span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="profile-distance">
          How far you live from them
        </label>
        <select
          id="profile-distance"
          className="select"
          value={values.distance_km}
          onChange={(e) => set("distance_km", Number(e.target.value))}
        >
          {DISTANCES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: "0.45rem" }}>
          Days you cannot do
        </legend>
        <div className="days">
          {WEEKDAYS.map((day) => (
            <button
              type="button"
              key={day}
              className="day"
              aria-pressed={values.days_off.includes(day)}
              onClick={() => set("days_off", toggled(values.days_off, day))}
            >
              {day}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: "0.45rem" }}>
          Work you cannot take
        </legend>
        <div className="chips">
          {REFUSABLE.map((type) => (
            <button
              type="button"
              key={type}
              className="chip"
              aria-pressed={values.refuses.includes(type)}
              onClick={() => set("refuses", toggled(values.refuses, type))}
            >
              {TYPE_META[type].label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="private">
        <label className="field-label private-label" htmlFor="profile-reason">
          <Lock size={14} />
          The reason, if you would rather not say it out loud
        </label>
        <textarea
          id="profile-reason"
          className="textarea"
          value={values.private_reason}
          maxLength={1000}
          onChange={(e) => set("private_reason", e.target.value)}
        />
        <span className="field-hint">
          Never shown to your family. They see which days and kinds of work you cannot do, not why.
        </span>
      </div>
    </>
  );
}
