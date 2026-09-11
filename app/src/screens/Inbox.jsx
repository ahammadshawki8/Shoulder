import React, { useState } from "react";
import { Store, PERSON_META } from "../data/store.js";
import { CheckCircle, AlertCircle, Check, ChevronRight, Scale, Info } from "../components/Icons.jsx";

export default function Inbox({ activeUser, onNavigate }) {
  const [selectedOption, setSelectedOption] = useState(0); // Default to recommended/first option
  const [showDetails, setShowDetails] = useState(false);
  const [justResolvedToast, setJustResolvedToast] = useState(null);

  const openCards = Store.getOpenEscalations();
  const currentCard = openCards[0];
  const userMeta = PERSON_META[activeUser] || PERSON_META.farah;

  const handleDecide = () => {
    if (selectedOption === null || !currentCard) return;

    const option = currentCard.options[selectedOption];
    Store.resolveEscalation(currentCard.id, selectedOption, activeUser);

    setJustResolvedToast(`Decided: ${option.label}`);
    setSelectedOption(0);

    setTimeout(() => {
      setJustResolvedToast(null);
    }, 3500);
  };

  // If no cards need attention
  if (!currentCard) {
    return (
      <div className="empty-inbox-calm">
        <div className="empty-calm-icon">
          <CheckCircle size={32} />
        </div>
        <h2 className="empty-calm-title">All caught up</h2>
        <p className="empty-calm-sub">
          No pending decisions need your family's attention right now. Your care schedule is running smoothly.
        </p>

        {justResolvedToast && (
          <div className="toast-decision-alert">
            <Check size={16} />
            <span>{justResolvedToast}. Added to your standing family rules.</span>
          </div>
        )}

        <div className="empty-calm-actions">
          <button className="btn-primary" onClick={() => onNavigate("schedule")}>
            Return to Schedule
          </button>
          <button className="btn-secondary" onClick={() => onNavigate("agreements")}>
            View Standing Rules
          </button>
        </div>
      </div>
    );
  }

  const isFairnessCard = currentCard.kind === "fairness_breach";

  const getPersonaPerspectiveNote = () => {
    if (activeUser === "amina") {
      return "Amina, as the closest sibling (4 km), you currently carry 44% of Mum's care. Choosing Option 1 (Paid overnight help) relieves your night burden and brings your share to a sustainable 34%.";
    }
    if (activeUser === "rian") {
      return "Rian, from Leeds (310 km), your financial and legal contributions are recognized. Choosing Option 1 uses your shared care fund to hire Elena, keeping physical duties balanced between your sisters.";
    }
    return "Farah, your Friday & Saturday recovery time is completely respected. This decision ensures Mum is covered on Wednesday overnight without asking you to break your confidential limits.";
  };

  return (
    <div className="inbox-screen">
      {justResolvedToast && (
        <div className="toast-decision-alert" style={{ marginBottom: 20 }}>
          <Check size={16} />
          <span>{justResolvedToast}</span>
        </div>
      )}

      {/* Sibling Perspective Card */}
      <div className="sibling-profile-card mb-4">
        <img src={userMeta.avatar} alt={userMeta.name} className="sibling-profile-avatar" />
        <div className="sibling-profile-meta">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-primary">Needs Your Family's Decision</h3>
            <span className="persona-you-badge">Viewing as {userMeta.shortName}</span>
          </div>
          <p className="text-secondary text-xs mt-1 leading-relaxed">
            {getPersonaPerspectiveNote()}
          </p>
        </div>
      </div>

      <div className="decision-action-card">
        {/* Decision Badge */}
        <div className="decision-status-row">
          <span className="decision-count-pill">
            Decision 1 of {openCards.length}
          </span>
          <span className="decision-kind-tag">
            {isFairnessCard ? "Careload Imbalance" : "Authority Envelope"}
          </span>
        </div>

        {/* Short Title & One-line context */}
        <h2 className="decision-visual-title">{currentCard.headline}</h2>
        <p className="decision-one-liner">{currentCard.the_tension}</p>

        {/* SELECTABLE OPTIONS */}
        <div className="decision-options-list">
          {currentCard.options.map((opt, idx) => {
            const isSelected = selectedOption === idx;
            return (
              <div
                key={idx}
                className={`decision-option-row ${isSelected ? "selected" : ""}`}
                onClick={() => setSelectedOption(idx)}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
              >
                <div className="option-radio-circle">
                  {isSelected && <div className="option-radio-dot" />}
                </div>

                <div className="option-text-wrap">
                  <div className="option-main-label">{opt.label}</div>
                  <div className="option-sub-consequence">{opt.consequence}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* WHAT CHANGES? (VISUAL BEFORE / AFTER IMPACT) */}
        <div className="visual-impact-section">
          <div className="impact-section-header">
            <Scale size={15} />
            <span>What Changes With This Choice</span>
          </div>

          <div className="impact-comparison-grid">
            {/* Before Bar */}
            <div className="impact-bar-item">
              <div className="impact-bar-label">Current Workload</div>
              <div className="impact-segmented-bar">
                <div style={{ width: "45%", background: PERSON_META.amina.color }} title="Amina 45%" />
                <div style={{ width: "30%", background: PERSON_META.rian.color }} title="Rian 30%" />
                <div style={{ width: "25%", background: PERSON_META.farah.color }} title="Farah 25%" />
              </div>
              <div className="impact-bar-caption">Amina is carrying 46% more than Farah</div>
            </div>

            {/* After Bar */}
            <div className="impact-bar-item">
              <div className="impact-bar-label">
                {selectedOption === 0 ? "Projected (Balanced)" : "Projected"}
              </div>
              <div className="impact-segmented-bar">
                {selectedOption === 0 ? (
                  <>
                    <div style={{ width: "34%", background: PERSON_META.amina.color }} title="Amina 34%" />
                    <div style={{ width: "33%", background: PERSON_META.rian.color }} title="Rian 33%" />
                    <div style={{ width: "33%", background: PERSON_META.farah.color }} title="Farah 33%" />
                  </>
                ) : (
                  <>
                    <div style={{ width: "42%", background: PERSON_META.amina.color }} title="Amina 42%" />
                    <div style={{ width: "31%", background: PERSON_META.rian.color }} title="Rian 31%" />
                    <div style={{ width: "27%", background: PERSON_META.farah.color }} title="Farah 27%" />
                  </>
                )}
              </div>
              <div className="impact-bar-caption">
                {selectedOption === 0
                  ? "Load spread drops to 4% (Fair & Sustainable)"
                  : "Load remains unbalanced"}
              </div>
            </div>
          </div>
        </div>

        {/* DECISION ACTION BUTTON */}
        <div className="decision-submit-row">
          <button className="btn-primary" onClick={handleDecide}>
            <Check size={16} />
            <span>Confirm Family Decision</span>
          </button>

          <button
            className="btn-quiet-text"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? "Hide reasoning" : "Why was this escalated?"}
          </button>
        </div>

        {/* COLLAPSIBLE EXPLAINER */}
        {showDetails && (
          <div className="decision-collapsible-reasoning">
            <div className="reasoning-block">
              <strong>What Shoulder tried:</strong>
              <p>{currentCard.what_i_tried}</p>
            </div>
            <div className="reasoning-block">
              <strong>What Shoulder refuses to decide alone:</strong>
              <p>
                {currentCard.what_i_will_not_decide ||
                  "Shoulder refuses to compromise someone's private health limits or unilaterally book paid services without family consensus."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
