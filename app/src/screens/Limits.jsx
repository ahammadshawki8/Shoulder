import React, { useState, useEffect } from "react";
import { Store, PERSON_META, WEEKDAYS, DAY_NAMES, TYPE_META, toPosition } from "../data/store.js";
import { Lock, Shield, Check, User, Users, CheckCircle } from "../components/Icons.jsx";

export default function Limits({ activeUser }) {
  const principal = Store.getPrincipal(activeUser);
  const userMeta = PERSON_META[activeUser] || PERSON_META.farah;

  const [capacity, setCapacity] = useState(principal ? Math.round(principal.capacity * 100) : userMeta.defaultCapacity || 70);
  const [dayStates, setDayStates] = useState({
    Mon: "available",
    Tue: "available",
    Wed: "available",
    Thu: "available",
    Fri: "available",
    Sat: "available",
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

    // Default fallback reasons per persona if not explicitly set
    if (!privReason) {
      if (activeUser === "farah") {
        privReason = "Chemotherapy infusions on Friday, recovering all Saturday. Strictly private.";
      } else if (activeUser === "amina") {
        privReason = "Managing school runs for two teens and full-time nursing shifts.";
      } else if (activeUser === "rian") {
        privReason = "Full-time corporate schedule in Leeds; corporate travel blackout Mon–Thu.";
      }
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
        id: `c-${activeUser}`,
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
      {/* Sibling Profile Header */}
      <div className="sibling-profile-card">
        <img src={userMeta.avatar} alt={userMeta.name} className="sibling-profile-avatar" />
        <div className="sibling-profile-meta">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-primary">{userMeta.name}</h2>
            <span className="persona-you-badge">Active View</span>
          </div>
          <p className="text-secondary text-sm mt-1">{userMeta.bio}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-soft">
            <span>📍 {userMeta.role}</span>
            <span>·</span>
            <span>📞 {userMeta.phone}</span>
            <span>·</span>
            <span>⚖️ Declared Capacity: <strong>{capacity}%</strong></span>
          </div>
        </div>
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
            <p className="text-xs text-soft mb-3">
              How much of Mum's overall monthly care share you can realistically shoulder right now.
            </p>

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
            <div className="planner-card-header">
              <span className="planner-card-title">Duties You Cannot Take</span>
              <span style={{ fontSize: 13, color: "var(--text-soft)" }}>Off-limits chore types</span>
            </div>

            <div className="task-type-chips-grid">
              {Object.entries(TYPE_META).map(([key, meta]) => {
                const isRefused = refusedTypes.includes(key);

                return (
                  <button
                    key={key}
                    type="button"
                    className={`type-chip-btn ${isRefused ? "refused" : "allowed"}`}
                    onClick={() => toggleTaskType(key)}
                  >
                    <span className="type-chip-status-icon">
                      {isRefused ? "✕" : "✓"}
                    </span>
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: CONFIDENTIAL VAULT & PUBLIC PREVIEW */}
        <div className="planner-side-column">
          {/* CONFIDENTIAL REASON VAULT */}
          <div className="private-vault-card">
            <div className="vault-header-row">
              <div className="vault-icon-badge">
                <Lock size={16} />
              </div>
              <div>
                <h3 className="vault-title">Confidential to Your Agent</h3>
                <p className="vault-subtext">Never shown to your siblings or stored in family logs</p>
              </div>
            </div>

            <div className="vault-input-area">
              <label className="vault-label">Your Private Reason (Kept on your phone):</label>
              <textarea
                className="vault-textarea"
                rows="3"
                value={privateReason}
                onChange={(e) => setPrivateReason(e.target.value)}
                placeholder="e.g. Health treatments, work deadlines, personal care needs..."
              />
              <div className="vault-guarantee-note">
                <Shield size={14} />
                <span>Enforced by cryptographic boundary filter. Siblings only see availability blocks.</span>
              </div>
            </div>
          </div>

          {/* WHAT YOUR SIBLINGS SEE */}
          <div className="public-position-preview-card">
            <div className="public-header-row">
              <Users size={16} />
              <span className="public-title">What Your Siblings See</span>
            </div>

            <div className="public-position-summary">
              <div className="public-stat-line">
                <span className="stat-name">Declared Capacity:</span>
                <strong className="stat-val">{capacity}%</strong>
              </div>

              <div className="public-stat-line">
                <span className="stat-name">Unavailable Days:</span>
                <strong className="stat-val">
                  {blockedDaysList.length ? blockedDaysList.join(", ") : "None (Available all week)"}
                </strong>
              </div>

              <div className="public-stat-line">
                <span className="stat-name">Excluded Tasks:</span>
                <strong className="stat-val">
                  {refusedTypes.length
                    ? refusedTypes.map((t) => TYPE_META[t]?.label || t).join(", ")
                    : "None"}
                </strong>
              </div>

              <div className="public-stat-line">
                <span className="stat-name">Reason Shared:</span>
                <span className="stat-val-italic">
                  {privateReason ? "Private personal constraint (Detail withheld)" : "Standard weekly schedule"}
                </span>
              </div>
            </div>
          </div>

          {/* SAVE BUTTON */}
          <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleSave}>
            <Check size={16} />
            <span>Save My Availability</span>
          </button>

          {savedSuccess && (
            <div className="toast-decision-alert" style={{ marginTop: 12 }}>
              <CheckCircle size={16} />
              <span>Limits saved! Sibling schedule updated.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
