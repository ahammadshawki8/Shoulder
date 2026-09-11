import React, { useState } from "react";
import { Shield, Lock, Scale, Users, CheckCircle, ChevronRight, ArrowRight } from "../components/Icons.jsx";

const STEPS = [
  {
    step: 1,
    title: "Private Intake",
    subtitle: "What you tell your agent stays with your agent",
    icon: Lock,
    detail: "Each sibling configures their own personal agent with availability, capacity, and confidential reasons. Reasons are held in device memory and never leave.",
  },
  {
    step: 2,
    title: "Position Boundary",
    subtitle: "Positions out, reasons never",
    icon: Shield,
    detail: "Only public availability windows and capacities leave your device. A privacy guard hook in code screens every outbound message to prevent sensitive leaks.",
  },
  {
    step: 3,
    title: "Autonomous Negotiation",
    subtitle: "Agents propose and counter over A2A",
    icon: Users,
    detail: "The Convener agent proposes care schedules, while principal agents critique and route around personal boundaries quietly in the background.",
  },
  {
    step: 4,
    title: "Deterministic Fair Division",
    subtitle: "Fairness is computed by math, never guessed",
    icon: Scale,
    detail: "Algorithms compute capacity-adjusted proportionality and envy-freeness. No language model determines the numbers.",
  },
  {
    step: 5,
    title: "Human Escalation",
    subtitle: "The agent refuses to decide for you",
    icon: CheckCircle,
    detail: "When a fair plan cannot be settled or an out-of-envelope decision is reached, Shoulder asks the family once with priced options. The humans decide.",
  },
];

export default function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="transparency-screen">
      <div className="screen-header-simple">
        <h2 className="screen-simple-title">How Shoulder Works</h2>
        <span className="screen-simple-tag">Architecture & Principles</span>
      </div>

      <p className="screen-caption-quiet">
        A quick visual walkthrough of how Shoulder redistributes eldercare fairly while strictly protecting family privacy.
      </p>

      {/* 5-Step Visual Flow Cards */}
      <div className="flow-steps-grid">
        {STEPS.map((s, index) => {
          const Icon = s.icon;
          const isCurrent = activeStep === index;
          return (
            <div
              key={s.step}
              className={`flow-step-card ${isCurrent ? "active" : ""}`}
              onClick={() => setActiveStep(index)}
              role="button"
              tabIndex={0}
            >
              <div className="step-num-badge">{s.step}</div>
              <div className="step-icon-circle">
                <Icon size={18} />
              </div>
              <div className="step-card-title">{s.title}</div>
              <div className="step-card-sub">{s.subtitle}</div>
            </div>
          );
        })}
      </div>

      {/* Detailed View of Active Step */}
      <div className="step-detail-box">
        <div className="step-detail-header">
          <div className="step-detail-title">
            Step {STEPS[activeStep].step}: {STEPS[activeStep].title}
          </div>
          <div className="step-detail-sub">{STEPS[activeStep].subtitle}</div>
        </div>
        <p className="step-detail-desc">{STEPS[activeStep].detail}</p>
      </div>
    </div>
  );
}
