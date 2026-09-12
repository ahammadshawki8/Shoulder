import React from "react";

/**
 * Somebody's face.
 *
 * The demo family have photographs. A circle somebody sets up themselves has
 * initials in their own colour, which is enough to tell people apart at a
 * glance and asks nobody to upload a picture before they can try it.
 */
export default function Face({ person, size = 24, className = "" }) {
  if (!person) return null;
  const style = { width: size, height: size };
  if (person.avatar) {
    return <img src={person.avatar} alt="" className={`face ${className}`} style={style} />;
  }
  return (
    <span
      className={`face face-initials ${className}`}
      style={{ ...style, background: person.color, fontSize: Math.max(9, size * 0.4) }}
      aria-hidden="true"
    >
      {person.initials || person.shortName?.[0] || "?"}
    </span>
  );
}
