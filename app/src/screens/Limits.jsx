import React, { useState, useEffect } from "react";
import { Store, PERSON_META, WEEKDAYS, DAY_NAMES, TYPE_META, toPosition } from "../data/store.js";
import { Lock, Shield, Check, User, Users, CheckCircle } from "../components/Icons.jsx";

export default function Limits({ activeUser }) {
  const principal = Store.getPrincipal(activeUser);
  const userMeta = PERSON_META[activeUser] || PERSON_META.farah;

  const [capacity, setCapacity] = useState(principal ? Math.round(principal.capacity * 100) : 70);
  const [dayStates, setDayStates] = useState({
    Mon: "available",
    Tue: "available",
    Wed: "available",
    Thu: "available",
    Fri: "unavailable",
    Sat: "unavailable",
    Sun: "available",
  });
  const [refusedTypes, setRefusedTypes] = useState([]);
  const [privateReason, setPrivateReason] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (!principal) return;
    setCapacity(Math.round(principal.capacity * 100));

    const days = {
      Mon: "available",
      Tue: "available",
      Wed: "available",
      Thu: "available",
      Fri: "available",
      Sat: "available",
      Sun: "available",
    };
    const refused = new Set();
    let privReason = "";

    for (const c of principal.constraints || []) {
      for (const d of c.blocks_weekdays || []) {
        days[d] = "unavailable";
      }
      for (const t of c.blocks_task_types || []) refused.add(t);
      if (c.tier === "private" && c.reason) privReason = c.reason;
    }

    setDayStates(days);
    setRefusedTypes([...refused]);
    setPrivateReason(privReason);
  }, [principal, activeUser]);

  const cycleDayState = (day) => {
    setDayStates((prev) => {
      const current = prev[day] || "available";
      const next = current === "available" ? "limited" : current === "limited" ? "unavailable" : "available";
      return { ...prev, [day]: next };
    });
  };

  const toggleTaskType = (typeKey) => {
    setRefusedTypes((prev) =>
      prev.includes(typeKey) ? prev.filter((t) => t !== typeKey) : [...prev, typeKey]
    );
  };

  const handleSave = (e) => {
    e.preventDefault();
    const blockedDays = Object.entries(dayStates)
      .filter(([_, state]) => state === "unavailable")
      .map(([day]) => day);

    const updatedConstraints = [
      {
        id: "c-active",
        tier: privateReason ? "private" : "shareable",
        summary: blockedDays.length ? `Unavailable on ${blockedDays.join(", ")}` : "Available all days",
        blocks_weekdays: blockedDays,
        blocks_task_types: refusedTypes,
        reason: privateReason,
      },
    ];

    Store.savePrincipal(activeUser, {
      capacity: capacity / 100,
      constraints: updatedConstraints,
    });

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  // Compute public position
  const blockedDaysList = Object.entries(dayStates)
    .filter(([_, state]) => state === "unavailable")
    .map(([day]) => day);

  return (
    <div className="limits-screen">
      {/* Top Header */}
      <div className="screen-header-simple">
        <h2 className="screen-simple-title">Availability & Capacity</h2>
        <span className="screen-simple-tag">Editing as {userMeta.shortName}</span>
      </div>

      <div className="planner-grid-layout">
        {/* LEFT COLUMN: VISUAL CAPACITY & AVAILABILITY PLANNER */}
        <div className="planner-main-column">
          {/* 1. VISUAL CAPACITY SLIDER */}
          <div className="planner-card">
            <div className="planner-card-header">
              <span className="planner-card-title">Careload Capacity</span>
              <span className="capacity-number-badge">{capacity}%</span>
            </div>

            <div className="capacity-bar-visual-wrap">
              <div className="capacity-bar-track">
                <div
                  className="capacity-bar-fill"
                  style={{ width: `${capacity}%`, background: userMeta.color }}
                />
              </div>
              <input
                type="range"
                min="20"
                max="100"
                step="5"
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="capacity-range-hidden"
              />
            </div>

            <div className="capacity-sub-scale">
              <span>20% (Light)</span>
              <span>60% (Moderate)</span>
              <span>100% (Full Share)</span>
            </div>
          </div>

          {/* 2. WEEKDAY AVAILABILITY BLOCKS */}
          <div className="planner-card">
            <div className="planner-card-header">
              <span className="planner-card-title">Weekly Availability</span>
              <span style={{ fontSize: 13, color: "var(--text-soft)" }}>Click to cycle state</span>
            </div>

            <div className="weekday-blocks-list">
              {WEEKDAYS.map((day) => {
                const state = dayStates[day];
                const isAvailable = state === "available";
                const isLimited = state === "limited";
                const isUnavailable = state === "unavailable";

                return (
                  <div
                    key={day}
                    className={`weekday-row-block ${state}`}
                    onClick={() => cycleDayState(day)}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="weekday-name">{DAY_NAMES[day]}</span>

                    <div className="weekday-bar-container">
                      <div className={`weekday-state-bar ${state}`} />
                    </div>

                    <span className={`weekday-status-pill ${state}`}>
                      {isAvailable && "Available"}
                      {isLimited && "Limited"}
                      {isUnavailable && "Blocked"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. TASK TYPE PREFERENCES */}
          <div className="planner-card">
            <span className="planner-card-title" style={{ display: "block", marginBottom: 12 }}>
              Excluded Care Duties
            </span>
            <div className="task-refusal-chips">
              {Object.entries(TYPE_META).map(([key, meta]) => {
                const isExcluded = refusedTypes.includes(key);
                return (
                  <button
                    type="button"
                    key={key}
                    className={`task-chip-toggle ${isExcluded ? "excluded" : ""}`}
                    onClick={() => toggleTaskType(key)}
                  >
                    {isExcluded ? "✕" : "✓"} {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. CONFIDENTIAL VAULT */}
          <div className="planner-card vault-card">
            <div className="vault-header">
              <div className="vault-badge">
                <Lock size={14} />
                <span>Strictly Confidential · Never leaves this device</span>
              </div>
            </div>

            <label className="vault-input-label">
              Private reason for limits (e.g. medical treatment, work constraint):
            </label>
            <textarea
              className="vault-textarea"
              value={privateReason}
              onChange={(e) => setPrivateReason(e.target.value)}
              placeholder="Nobody else will ever read this. Your agent negotiates around your constraint without ever revealing why."
            />
          </div>

          {/* Action Row */}
          <div className="planner-actions-row">
            <button className="btn-primary" onClick={handleSave}>
              Save Availability
            </button>
            {savedSuccess && (
              <span className="save-success-msg">
                <Check size={16} /> Saved to private agent
              </span>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: WHAT FAMILY SEES PREVIEW */}
        <div className="planner-preview-column">
          <div className="preview-position-card">
            <div className="preview-position-header">
              <Users size={16} />
              <span>What Family Sees</span>
            </div>

            <div className="preview-position-body">
              <div className="preview-metric-group">
                <div className="preview-label">Declared Capacity</div>
                <div className="preview-value">{capacity}% of full care share</div>
              </div>

              <div className="preview-metric-group">
                <div className="preview-label">Unavailable Days</div>
                <div className="preview-value">
                  {blockedDaysList.length ? blockedDaysList.map((d) => DAY_NAMES[d]).join(", ") : "None (Available all week)"}
                </div>
              </div>

              <div className="preview-metric-group">
                <div className="preview-label">Excluded Tasks</div>
                <div className="preview-value">
                  {refusedTypes.length
                    ? refusedTypes.map((t) => TYPE_META[t]?.label || t).join(", ")
                    : "None (Open to all duties)"}
                </div>
              </div>

              <div className="preview-privacy-lock-box">
                <Shield size={16} style={{ color: "var(--badge-success)" }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--badge-success)" }}>
                    Privacy Boundary Held
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Your private reason is completely filtered out. Family agents only learn availability windows.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
