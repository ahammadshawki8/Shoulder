import React, { useState } from "react";
import { Store, TYPE_META, WEEKDAYS } from "../data/store.js";
import Face from "../components/Face.jsx";
import { ArrowRight, Check, Lock, Plus, Trash2 } from "../components/Icons.jsx";

const REFUSABLE = ["night", "transport", "appointment", "household"];

/**
 * Setting up a real circle.
 *
 * Two questions: who is being cared for, and who is sharing it. Everything
 * else can wait, because a circle with two people in it is already enough to
 * work out a split and to have something worth arguing about.
 *
 * The private reason is on this screen on purpose. It is the one thing the
 * others never see, and asking for it here is what makes that promise real
 * rather than a paragraph on a marketing page.
 */
export default function Setup() {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("Mum");
  const people = Store.getPrincipals();

  if (!Store.hasRecipient()) {
    return (
      <div className="setup">
        <div className="setup-card">
          <span className="setup-step">First</span>
          <h1>Who are you all looking after?</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              Store.setRecipient({ name: name.trim(), relation });
            }}
          >
            <input
              className="form-title"
              autoFocus
              value={name}
              placeholder="Their name"
              onChange={(e) => setName(e.target.value)}
            />
            <div className="chips">
              {["Mum", "Dad", "Nan", "Grandad", "Someone else"].map((option) => (
                <button
                  type="button"
                  key={option}
                  className={`chip ${relation === option ? "on" : ""}`}
                  onClick={() => setRelation(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            <button className="btn-solid" type="submit" disabled={!name.trim()}>
              Next <ArrowRight size={15} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <AddPeople people={people} recipient={Store.getRecipient().name} />;
}

function AddPeople({ people, recipient }) {
  const [open, setOpen] = useState(people.length === 0);

  return (
    <div className="setup">
      <div className="setup-card wide">
        <span className="setup-step">Now</span>
        <h1>Who shares the care for {recipient}?</h1>
        <p className="setup-sub">
          Add yourself first, then anyone else. You can change all of this later.
        </p>

        {people.length > 0 && (
          <ul className="setup-people">
            {people.map((p) => {
              const meta = Store.person(p.id);
              const days = (p.constraints || []).flatMap((c) => c.blocks_weekdays || []);
              const privately = (p.constraints || []).some((c) => c.tier === "private");
              return (
                <li key={p.id}>
                  <Face person={meta} size={34} />
                  <div className="setup-person-body">
                    <strong>{p.name}</strong>
                    <span>
                      can take on {Math.round(p.capacity * 100)}%
                      {days.length ? `, not ${days.join(", ")}` : ""}
                      {privately && (
                        <em className="setup-private">
                          <Lock size={10} /> holds something private
                        </em>
                      )}
                    </span>
                  </div>
                  <button
                    className="link-danger"
                    onClick={() => Store.removePerson(p.id)}
                    aria-label={`Remove ${p.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {open ? (
          <PersonForm
            onDone={() => setOpen(false)}
            onCancel={people.length ? () => setOpen(false) : null}
          />
        ) : (
          <button className="btn-quiet" onClick={() => setOpen(true)}>
            <Plus size={14} /> Add someone
          </button>
        )}

        {people.length > 0 && !open && (
          <button className="btn-solid" onClick={() => Store.finishSetup()}>
            <Check size={16} /> Done, show me the plan
          </button>
        )}
      </div>
    </div>
  );
}

function PersonForm({ onDone, onCancel }) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(70);
  const [distanceKm, setDistanceKm] = useState(5);
  const [daysOff, setDaysOff] = useState([]);
  const [refuses, setRefuses] = useState([]);
  const [privateReason, setPrivateReason] = useState("");

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <form
      className="person-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        Store.addPerson({
          name,
          capacity: capacity / 100,
          distanceKm,
          daysOff,
          refuses,
          privateReason: privateReason.trim(),
        });
        onDone();
      }}
    >
      <input
        className="form-title"
        autoFocus
        value={name}
        placeholder="Their name"
        onChange={(e) => setName(e.target.value)}
      />

      <div className="form-row">
        <label>
          <span>Can take on {capacity}%</span>
          <input
            type="range"
            min="20"
            max="100"
            step="5"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </label>
        <label>
          <span>Distance away</span>
          <select value={distanceKm} onChange={(e) => setDistanceKm(Number(e.target.value))}>
            <option value={2}>Round the corner</option>
            <option value={10}>Same town</option>
            <option value={40}>An hour away</option>
            <option value={300}>Far away</option>
          </select>
        </label>
      </div>

      <div className="field">
        <span className="field-label">Days they cannot do</span>
        <div className="days">
          {WEEKDAYS.map((day) => (
            <button
              type="button"
              key={day}
              className={`day-chip ${daysOff.includes(day) ? "off" : ""}`}
              onClick={() => toggle(daysOff, setDaysOff, day)}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">Work they cannot take</span>
        <div className="chips">
          {REFUSABLE.map((type) => (
            <button
              type="button"
              key={type}
              className={`chip ${refuses.includes(type) ? "on" : ""}`}
              onClick={() => toggle(refuses, setRefuses, type)}
            >
              {TYPE_META[type].label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">
          <Lock size={12} /> Why, if there is a reason they would rather not share
        </span>
        <textarea
          rows={2}
          value={privateReason}
          placeholder="Nobody else will ever see this"
          onChange={(e) => setPrivateReason(e.target.value)}
        />
        <span className="private-foot">
          Kept on this device. The others see the days and the kind of work, never this.
        </span>
      </div>

      <div className="person-form-actions">
        <button className="btn-solid" type="submit" disabled={!name.trim()}>
          Add them
        </button>
        {onCancel && (
          <button type="button" className="link-quiet" onClick={onCancel}>
            cancel
          </button>
        )}
      </div>
    </form>
  );
}
