import React, { useState } from "react";
import { Store, PERSON_META } from "../data/store.js";
import { Shield, CheckCircle, ChevronRight, Clock, Sparkles } from "../components/Icons.jsx";

export default function Agreements({ activeUser }) {
  const precedents = Store.getPrecedents();
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="agreements-screen">
      <div className="screen-header-simple">
        <h2 className="screen-simple-title">Family Memory & Agreements</h2>
        <span className="screen-simple-tag">{precedents.length} active standing rules</span>
      </div>

      <p className="screen-caption-quiet">
        When your family resolves a scheduling question, Shoulder saves it as a permanent agreement. It applies to all future months automatically so nobody has to repeat the conversation.
      </p>

      <div className="timeline-visual-container">
        {precedents.map((item, index) => {
          const isExpanded = expandedId === item.id;
          return (
            <div key={item.id || index} className="timeline-event-card">
              <div className="timeline-spine">
                <div className="timeline-dot-active">
                  <CheckCircle size={14} />
                </div>
                {index < precedents.length - 1 && <div className="timeline-line" />}
              </div>

              <div className="timeline-content">
                <div className="timeline-card-header" onClick={() => toggleExpand(item.id)}>
                  <div className="timeline-rule-title">
                    {item.rule}
                  </div>
                  <ChevronRight size={16} className={`accordion-arrow ${isExpanded ? "open" : ""}`} />
                </div>

                {/* Compact Flow Indicators */}
                <div className="timeline-flow-pills">
                  <span className="flow-step-pill">Decision Made</span>
                  <span className="flow-arrow">→</span>
                  <span className="flow-step-pill">Applied to Current Month</span>
                  <span className="flow-arrow">→</span>
                  <span className="flow-step-pill active">Standing Rule</span>
                </div>

                <div className="timeline-provenance-text">
                  {item.provenance}
                </div>

                {isExpanded && (
                  <div className="timeline-expanded-details">
                    <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
                      <strong>Status:</strong> Active precedent. Automatically incorporated into every weekly agent negotiation. Covered tasks are reserved or assigned before open slots are shared.
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
