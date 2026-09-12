import React from "react";
import { Store } from "../data/store.js";
import { ArrowRight, Users, Sparkles } from "../components/Icons.jsx";

/**
 * The front door.
 *
 * Two ways in, and the choice is honest about which is which. The demo is a
 * real month from a real negotiation, with people who do not exist. The other
 * is empty, and everything in it will be yours.
 */
export default function Welcome() {
  const waiting = Store.hasOwnCircle();

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <span className="welcome-mark">S</span>
        <h1>Shoulder</h1>
        <p className="welcome-line">
          Nobody should shoulder it alone. Care for a parent gets divided here, in
          the open, without anyone having to ask.
        </p>

        <div className="welcome-choices">
          <button className="choice" onClick={() => Store.useDemo()}>
            <span className="choice-icon">
              <Users size={20} />
            </span>
            <strong>Look around a family</strong>
            <em>
              The Rahmans: three siblings, one month of care, and a split that will
              not come out even. Everything is already filled in, including the
              decision they still have to make.
            </em>
            <span className="choice-go">
              See the demo <ArrowRight size={15} />
            </span>
            <span className="choice-foot">Invented people, real numbers</span>
          </button>

          <div
            className="choice choice-own"
            role="button"
            tabIndex={0}
            onClick={() => Store.startOwn()}
            onKeyDown={(e) => e.key === "Enter" && Store.startOwn()}
          >
            <span className="choice-icon">
              <Sparkles size={20} />
            </span>
            <strong>{waiting ? "Your circle" : "Set up your own"}</strong>
            <em>
              {waiting
                ? "Pick up where you left off. Everything you put in is still here, on this device."
                : "Add whoever shares the care, say what each of you can take on, put in what needs doing. It works out the split and asks you when it cannot make it fair."}
            </em>
            <span className="choice-go">
              {waiting ? "Open it" : "Start empty"} <ArrowRight size={15} />
            </span>
            {waiting ? (
              <button
                className="choice-foot as-link"
                onClick={(e) => {
                  e.stopPropagation();
                  Store.clearOwn();
                  Store.startOwn();
                }}
              >
                or start over with an empty one
              </button>
            ) : (
              <span className="choice-foot">Stays on this device</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
