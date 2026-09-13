import React from "react";

/**
 * Somebody's face: their photo if they added one, otherwise their initials in
 * their own colour. Enough to tell people apart at a glance.
 */
export default function Face({ person, size = 28 }) {
  if (!person) return null;
  const style = { width: size, height: size };
  if (person.avatar) {
    return <img src={person.avatar} alt="" className="face" style={style} />;
  }
  return (
    <span
      className="face face-initials"
      style={{ ...style, background: person.color, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      aria-hidden="true"
    >
      {person.initials || person.shortName?.[0] || "?"}
    </span>
  );
}
