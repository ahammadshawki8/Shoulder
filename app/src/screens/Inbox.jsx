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

  return (
    <div className="inbox-screen">
      {justResolvedToast && (
        <div className="toast-decision-alert" style={{ marginBottom: 20 }}>
          <Check size={16} />
          <span>{justResolvedToast}</span>
        </div>
      )}

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
                    <div style={{ width: "33%", background: PERSON_META.amina.color }} title="Amina 33%" />
                    <div style={{ width: "30%", background: PERSON_META.rian.color }} title="Rian 30%" />
                    <div style={{ width: "27%", background: PERSON_META.farah.color }} title="Farah 27%" />
                    <div style={{ width: "10%", background: "var(--badge-paid)" }} title="Paid Help 10%" />
                  </>
                ) : (
                  <>
                    <div style={{ width: "45%", background: PERSON_META.amina.color }} title="Amina 45%" />
                    <div style={{ width: "30%", background: PERSON_META.rian.color }} title="Rian 30%" />
                    <div style={{ width: "25%", background: PERSON_META.farah.color }} title="Farah 25%" />
                  </>
                )}
              </div>
              <div className="impact-bar-caption" style={{ color: selectedOption === 0 ? "var(--badge-success)" : "var(--text-muted)" }}>
                {selectedOption === 0 ? "✓ Load balanced evenly across all siblings" : "Spread remains unadjusted"}
              </div>
            </div>
          </div>
        </div>

        {/* Why Shoulder Paused (Behind "Why?" accordion) */}
        <div className="why-paused-accordion">
          <button
            className="why-toggle-btn"
            onClick={() => setShowDetails(!showDetails)}
            aria-expanded={showDetails}
          >
            <Info size={14} />
            <span>Why did Shoulder ask the family instead of deciding?</span>
            <ChevronRight size={14} className={`accordion-arrow ${showDetails ? "open" : ""}`} />
          </button>

          {showDetails && (
            <div className="why-content-panel">
              <p className="why-refusal-text">
                "{currentCard.what_i_will_not_decide || "Personal, financial, and family priorities belong to you. Shoulder will never impose decisions about money or personal availability."}"
              </p>
              {currentCard.what_i_tried?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>What the agents checked first:</div>
                  <ul style={{ paddingLeft: 18, fontSize: 13, color: "var(--text-muted)" }}>
                    {currentCard.what_i_tried.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirmation Button */}
        <div className="decision-action-footer">
          <button
            className="btn-primary"
            onClick={handleDecide}
            disabled={selectedOption === null}
          >
            Confirm Choice as {userMeta.shortName}
          </button>

          <span className="decision-note-safe">
            Records as a standing family rule for next month.
          </span>
        </div>
      </div>
    </div>
  );
}
