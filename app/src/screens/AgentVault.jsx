import React from "react";
import { Store, PERSON_META, toPosition, DAY_NAMES, TYPE_META } from "../data/store.js";
import { Lock, Shield, User, Users, CheckCircle } from "../components/Icons.jsx";

export default function AgentVault({ activeUser }) {
  const principal = Store.getPrincipal(activeUser);
  const userMeta = PERSON_META[activeUser] || PERSON_META.farah;

  const position = toPosition(principal || {});
  const privateConstraint = principal?.constraints?.find((c) => c.tier === "private");

  // Persona-specific private reason fallback
  const getConfidentialReason = () => {
    if (privateConstraint?.reason) return privateConstraint.reason;
    if (activeUser === "farah") {
      return "Chemotherapy infusions on Friday, recovering all Saturday. She has not told her brother or sister and does not intend to.";
    }
    if (activeUser === "amina") {
      return "Managing exam revision for two teenagers and heavy NHS hospital night shifts. Keeps it off family rota to avoid sibling comparison.";
    }
    if (activeUser === "rian") {
      return "Based in Leeds (310 km away). Corporate contractual travel restrictions prevent physical presence on weekdays.";
    }
    return "Personal private commitments and health schedule.";
  };

  return (
    <div className="transparency-screen">
      {/* Sibling Agent Header with Avatar */}
      <div className="sibling-profile-card">
        <img src={userMeta.avatar} alt={userMeta.name} className="sibling-profile-avatar" />
        <div className="sibling-profile-meta">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-primary">{userMeta.name}'s Device Vault</h2>
            <span className="persona-you-badge">Private Agent</span>
          </div>
          <p className="text-secondary text-sm mt-1">
            Your personal AI agent runs locally on your device. It advocates for your fair share and strictly
            guards what you tell it in confidence.
          </p>
        </div>
      </div>

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
            <div className="secret-label">Personal Confidential Note:</div>
            <div className="secret-quote">
              "{getConfidentialReason()}"
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

          <h3 className="split-title">What Reaches the Family Circle</h3>

          <div className="shared-position-list">
            <div className="shared-item">
              <span className="shared-key">Declared Capacity</span>
              <span className="shared-val">{Math.round((principal?.capacity || 0.7) * 100)}% of monthly careload</span>
            </div>

            <div className="shared-item">
              <span className="shared-key">Unavailable Weekdays</span>
              <span className="shared-val">
                {position.unavailable.length
                  ? position.unavailable.map((d) => DAY_NAMES[d] || d).join(", ")
                  : "None (Available all week)"}
              </span>
            </div>

            <div className="shared-item">
              <span className="shared-key">Refused Task Categories</span>
              <span className="shared-val">
                {position.refused.length
                  ? position.refused.map((t) => TYPE_META[t]?.label || t).join(", ")
                  : "None (Will help where needed)"}
              </span>
            </div>

            <div className="shared-item">
              <span className="shared-key">Public Statement to Siblings</span>
              <span className="shared-val" style={{ fontStyle: "italic" }}>
                "{position.unavailable.length ? `Unavailable on ${position.unavailable.join(", ")}` : "Standard weekly availability."}"
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
