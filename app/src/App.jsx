import React, { useEffect, useState } from "react";
import { Store, subscribeStore } from "./data/store.js";
import {
  Bell,
  Calendar,
  Clock,
  Info,
  Lock,
  Moon,
  Plus,
  Shield,
  Sliders,
  Sun,
} from "./components/Icons.jsx";
import BalanceRail from "./components/BalanceRail.jsx";
import Face from "./components/Face.jsx";
import Welcome from "./screens/Welcome.jsx";
import Setup from "./screens/Setup.jsx";
import Schedule from "./screens/Schedule.jsx";
import Limits from "./screens/Limits.jsx";
import Inbox from "./screens/Inbox.jsx";
import Agreements from "./screens/Agreements.jsx";
import AgentVault from "./screens/AgentVault.jsx";
import Activity from "./screens/Activity.jsx";
import HowItWorks from "./screens/HowItWorks.jsx";
import AddTaskModal from "./components/AddTaskModal.jsx";

const NAV = [
  { id: "schedule", label: "Tasks", icon: Calendar },
  { id: "inbox", label: "Needs you", icon: Bell },
  { id: "limits", label: "My limits", icon: Sliders },
  { id: "agreements", label: "Agreed", icon: Shield },
];

const QUIET_NAV = [
  { id: "agent", label: "Your agent", icon: Lock },
  { id: "activity", label: "What it did", icon: Clock },
  { id: "how-it-works", label: "How it works", icon: Info },
];

const ROUTES = [...NAV, ...QUIET_NAV].map((item) => item.id);

function currentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return ROUTES.includes(hash) ? hash : "schedule";
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  const [tick, setTick] = useState(0);
  const [addingTask, setAddingTask] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("shoulder_theme_v2") || "light");

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("shoulder_theme_v2", theme);
  }, [theme]);

  useEffect(() => subscribeStore(() => setTick((n) => n + 1)), []);

  const mode = Store.getMode();
  if (!mode) return <Welcome />;
  if (!Store.isReady()) return <Setup />;

  const navigate = (id) => {
    window.location.hash = `#/${id}`;
  };

  const activeUser = Store.getActiveUser();
  const me = Store.person(activeUser);
  const recipient = Store.getRecipient();
  const openCards = Store.getOpenEscalations().length;
  const people = Store.people().filter(Boolean);

  return (
    <div className="shell">
      {/* ---------------------------------------------------------------
          The rail. Fixed height, never scrolls: who you are, who she is,
          and how the load sits. Everything here is a glance, not a read.
          --------------------------------------------------------------- */}
      <aside className="rail">
        <div className="rail-head">
          <a href="#/schedule" className="rail-brand">
            <span className="rail-mark">S</span>
            <span>Shoulder</span>
          </a>
          <button
            className={`mode-chip ${mode}`}
            onClick={() => Store.leaveMode()}
            title="Switch between the demo and your own circle"
          >
            {mode === "demo" ? "Demo" : "Yours"}
          </button>
        </div>

        <button className="rail-mum" onClick={() => navigate("how-it-works")}>
          {recipient.avatar ? (
            <img src={recipient.avatar} alt="" className="rail-mum-photo" />
          ) : (
            <span className="rail-mum-photo rail-mum-blank">{recipient.relation[0]}</span>
          )}
          <span className="rail-mum-text">
            <span className="rail-mum-name">{recipient.relation}</span>
            <span className="rail-mum-status">
              <i className="dot-live" />
              {recipient.name}
            </span>
          </span>
        </button>

        <BalanceRail activeUser={activeUser} />

        {openCards > 0 && (
          <button className="rail-needs" onClick={() => navigate("inbox")}>
            <span className="rail-needs-count">{openCards}</span>
            <span>
              needs you
              <em>a decision only you can make</em>
            </span>
          </button>
        )}

        <nav className="rail-nav">
          {NAV.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#/${id}`} className={`rail-link ${route === id ? "active" : ""}`}>
              <Icon size={16} />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <div className="rail-spacer" />

        <button className="rail-add" onClick={() => setAddingTask(true)}>
          <Plus size={15} />
          <span>Add a task</span>
        </button>

        <div className="rail-quiet">
          {QUIET_NAV.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#/${id}`}
              className={`rail-quiet-link ${route === id ? "active" : ""}`}
            >
              <Icon size={14} />
              <span>{label}</span>
            </a>
          ))}
        </div>

        <div className="rail-me">
          <Face person={me} size={30} />
          {people.length > 1 ? (
            <select
              className="rail-me-select"
              value={activeUser || ""}
              onChange={(e) => Store.setActiveUser(e.target.value)}
              aria-label="Who is using this"
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.shortName}
                </option>
              ))}
            </select>
          ) : (
            <span className="rail-me-only">{me?.shortName}</span>
          )}
          <button
            className="rail-theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </aside>

      {/* The work. This is the only thing that scrolls. */}
      <main className="work">
        {route === "schedule" && (
          <Schedule activeUser={activeUser} onNavigate={navigate} onAdd={() => setAddingTask(true)} />
        )}
        {route === "inbox" && <Inbox activeUser={activeUser} onNavigate={navigate} />}
        {route === "limits" && <Limits activeUser={activeUser} onNavigate={navigate} />}
        {route === "agreements" && <Agreements activeUser={activeUser} onNavigate={navigate} />}
        {route === "agent" && <AgentVault activeUser={activeUser} onNavigate={navigate} />}
        {route === "activity" && <Activity onNavigate={navigate} />}
        {route === "how-it-works" && <HowItWorks onNavigate={navigate} />}
      </main>

      <nav className="tabbar">
        {NAV.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#/${id}`} className={`tabbar-item ${route === id ? "active" : ""}`}>
            <span className="tabbar-icon">
              <Icon size={18} />
              {id === "inbox" && openCards > 0 && <b className="tabbar-pip">{openCards}</b>}
            </span>
            <span>{label}</span>
          </a>
        ))}
      </nav>

      <AddTaskModal
        isOpen={addingTask}
        onClose={() => setAddingTask(false)}
        activeUser={activeUser}
        onTaskAdded={() => navigate("schedule")}
      />
    </div>
  );
}
