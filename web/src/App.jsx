import { useEffect, useMemo, useState } from "react";
import { MONTHS } from "./data.js";
import { Moon, Sun } from "./components/Icons.jsx";
import Why from "./screens/Why.jsx";
import Intake from "./screens/Intake.jsx";
import Month from "./screens/Month.jsx";
import Inbox from "./screens/Inbox.jsx";
import Ledger from "./screens/Ledger.jsx";
import UnderTheHood from "./screens/UnderTheHood.jsx";

const SCREENS = [
  { id: "why", label: "Why" },
  { id: "intake", label: "Your agent" },
  { id: "month", label: "This month" },
  { id: "inbox", label: "Needs you" },
  { id: "ledger", label: "What I did" },
  { id: "hood", label: "Under the hood" },
];

// #/screen/period[/step]. The optional step opens the negotiation at a given
// round, so any moment can be linked to or recorded directly.
function readHash() {
  const [screen, month, step] = window.location.hash.replace(/^#\/?/, "").split("/");
  return {
    screen: SCREENS.some((s) => s.id === screen) ? screen : "why",
    month: MONTHS.some((m) => m.period === month) ? month : MONTHS[0].period,
    step: Number.isInteger(Number(step)) && step !== undefined ? Number(step) : 0,
  };
}

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "system");
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      if (theme === "system") localStorage.removeItem("shoulder-theme");
      else localStorage.setItem("shoulder-theme", theme);
    } catch (e) {
      /* storage can be unavailable; the theme still applies for this visit */
    }
  }, [theme]);
  const effective =
    theme === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  return [effective, () => setTheme(effective === "dark" ? "light" : "dark")];
}

export default function App() {
  const [route, setRoute] = useState(readHash);
  const [theme, toggleTheme] = useTheme();
  // Decisions made in the inbox this visit, per period: { cardId: optionIndex }.
  // Kept in memory on purpose; reloading replays the month from the fixtures.
  const [decisions, setDecisions] = useState({});

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const label = SCREENS.find((s) => s.id === route.screen)?.label;
    document.title = `${label} | Shoulder`;
    window.scrollTo({ top: 0 });
  }, [route.screen]);

  const month = useMemo(() => MONTHS.find((m) => m.period === route.month), [route.month]);
  const go = (screen, period = route.month) => {
    window.location.hash = `/${screen}/${period}`;
  };

  const monthDecisions = decisions[month.period] || {};
  const open = month.escalations.filter((c) => !(c.id in monthDecisions)).length;

  const props = {
    month,
    go,
    decisions: monthDecisions,
    decide: (cardId, index, alsoIds = []) =>
      setDecisions((d) => {
        const next = { ...(d[month.period] || {}), [cardId]: index };
        for (const id of alsoIds) next[id] = `answered:${cardId}`;
        return { ...d, [month.period]: next };
      }),
    resetDecisions: () => setDecisions((d) => ({ ...d, [month.period]: {} })),
  };

  return (
    <div className="shell">
      <header className="topbar">
        <a className="wordmark" href={`#/why/${month.period}`}>
          <strong>Shoulder</strong>
          <span>Nobody should shoulder it alone.</span>
        </a>
        <div className="topbar-tools">
          <div className="segmented" role="group" aria-label="Month">
            {MONTHS.map((m) => (
              <button key={m.period} aria-pressed={m.period === month.period} onClick={() => go(route.screen, m.period)}>
                {m.label}
              </button>
            ))}
          </div>
          <button className="icon-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? <Sun /> : <Moon />}
          </button>
        </div>
      </header>

      <nav className="nav" aria-label="Screens">
        {SCREENS.map((s) => (
          <a key={s.id} href={`#/${s.id}/${month.period}`} aria-current={s.id === route.screen ? "page" : undefined}>
            {s.label}
            {s.id === "inbox" && open > 0 && (
              <span className="badge" aria-label={`${open} waiting`}>
                {open}
              </span>
            )}
          </a>
        ))}
      </nav>

      <main>
        {route.screen === "why" && <Why {...props} />}
        {route.screen === "intake" && <Intake {...props} />}
        {route.screen === "month" && <Month {...props} initialStep={route.step} />}
        {route.screen === "inbox" && <Inbox {...props} />}
        {route.screen === "ledger" && <Ledger {...props} />}
        {route.screen === "hood" && <UnderTheHood {...props} />}
      </main>

      <footer className="footer">
        The Rahman family is fictional. Every number and sentence on these screens comes from a real run of the
        negotiation, recorded in <code>fixtures/</code>. No real family data is used anywhere.
      </footer>
    </div>
  );
}
