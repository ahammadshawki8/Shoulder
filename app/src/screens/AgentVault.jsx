import React from "react";
import { Store, PERSON_META, toPosition, DAY_NAMES, TYPE_META } from "../data/store.js";
import { Lock, Shield, User, Users, CheckCircle } from "../components/Icons.jsx";

export default function AgentVault({ activeUser }) {
  const principal = Store.getPrincipal(activeUser);
  const userMeta = PERSON_META[activeUser] || PERSON_META.farah;

  const position = toPosition(principal || {});
  const privateConstraint = principal?.constraints?.find((c) => c.tier === "private");

  return (
    <div className="transparency-screen">
      <div className="screen-header-simple">
        <h2 className="screen-simple-title">Your Private Agent Vault</h2>
        <span className="screen-simple-tag">Active Principal: {userMeta.shortName}</span>
      </div>

      <p className="screen-caption-quiet">
        Each sibling has their own private agent running independently. Your agent keeps what you say in confidence and only shares non-sensitive positions with the circle.
      </p>

      {/* Visual Privacy Split */}
      <div className="privacy-split-container">
        {/* TOP/LEFT: PRIVATE TO YOUR AGENT */}
        <div className="privacy-split-card private-side">
          <div className="split-badge private">
            <Lock size={14} />
            <span>STRICTLY PRIVATE · Kept in your device vault</span>
          </div>

          <h3 className="split-title">What You Told Your Agent</h3>

          <div className="vault-secret-display">
            <div className="secret-label">Personal Confidential Constraint:</div>
            <div className="secret-quote">
              "{privateConstraint?.reason || "Unavailable on Fridays due to personal health appointments."}"
            </div>
            <div className="secret-guarantee">
              <Shield size={14} /> Never transmitted across the network or stored in family databases.
            </div>
          </div>
        </div>

        {/* MIDDLE: THE PRIVACY BOUNDARY HOOK */}
        <div className="privacy-filter-barrier">
          <div className="barrier-line" />
          <div className="barrier-pill">
            <Shield size={16} />
            <span>Privacy Guard Hook (Enforced in Code)</span>
          </div>
          <div className="barrier-line" />
        </div>

        {/* BOTTOM/RIGHT: SHARED WITH FAMILY */}
        <div className="privacy-split-card shared-side">
          <div className="split-badge shared">
            <Users size={14} />
            <span>SHARED WITH CIRCLE · Family Position</span>
          </div>

          <h3 className="split-title">What Your Siblings' Agents Receive</h3>

          <div className="shared-position-list">
            <div className="shared-item">
              <span className="shared-key">Availability:</span>
              <span className="shared-val">
                {position.unavailable?.length ? `Unavailable on ${position.unavailable.map((d) => DAY_NAMES[d]).join(" and ")}` : "All days"}
              </span>
            </div>
            <div className="shared-item">
              <span className="shared-key">Capacity:</span>
              <span className="shared-val">{Math.round(position.capacity * 100)}% standard share</span>
            </div>
            <div className="shared-item">
              <span className="shared-key">Excluded Duties:</span>
              <span className="shared-val">
                {position.refused?.length ? position.refused.map((t) => TYPE_META[t]?.label || t).join(", ") : "None"}
              </span>
            </div>
            <div className="shared-item">
              <span className="shared-key">Reason:</span>
              <span className="shared-val" style={{ color: "var(--badge-success)", fontWeight: 600 }}>
                [Completely Withheld & Scrubbed]
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
