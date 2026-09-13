import React, { useEffect, useState } from "react";
import { Store } from "./data/store.js";
import { Bell, Calendar, Info, Plus, Shield, Sliders } from "./components/Icons.jsx";
import Face from "./components/Face.jsx";
import { Brand, ThemeToggle, useStore, useTheme } from "./components/ui.jsx";
import Auth from "./screens/Auth.jsx";
import Tasks from "./screens/Tasks.jsx";
import Inbox from "./screens/Inbox.jsx";
import Agreed from "./screens/Agreed.jsx";
import ControlPanel from "./screens/ControlPanel.jsx";
import About from "./screens/About.jsx";
import AddTaskModal from "./components/AddTaskModal.jsx";

const NAV = [
  { id: "tasks", label: "Tasks", icon: Calendar },
  { id: "inbox", label: "Needs you", icon: Bell },
  { id: "agreed", label: "Agreed", icon: Shield },
  { id: "control", label: "Control Panel", icon: Sliders },
];
const ROUTES = [...NAV.map((n) => n.id), "about"];

function routeFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return ROUTES.includes(hash) ? hash : "tasks";
}

export default function App() {
  useStore();
  const [theme, toggleTheme] = useTheme();
  const [route, setRoute] = useState(routeFromHash);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    Store.boot();
  }, []);

  useEffect(() => {
    const onHash = () => {
      setRoute(routeFromHash());
      window.scrollTo(0, 0);
      if (Store.status() === "ready") Store.refresh();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Siblings change the plan from their own devices. Pick those changes up when
  // this tab comes back into view, and every so often while it is open, so two
  // people looking at the same family see the same thing.
  useEffect(() => {
    const fresh = () => document.visibilityState === "visible" && Store.status() === "ready" && Store.refresh();
    document.addEventListener("visibilitychange", fresh);
    const timer = setInterval(fresh, 20000);
    return () => {
      document.removeEventListener("visibilitychange", fresh);
      clearInterval(timer);
    };
  }, []);

  const status = Store.status();

  if (status === "booting") {
    return (
      <div className="splash" aria-busy="true">
        <Brand />
      </div>
    );
  }

  if (status === "signed-out") {
    return <Auth theme={theme} onToggleTheme={toggleTheme} />;
  }

  const navigate = (id) => {
    window.location.hash = `#/${id}`;
  };
  const me = Store.person(Store.meId());
  const recipient = Store.recipient();
  const waiting = Store.needsMeCount();

  return (
    <div className="shell">
      <aside className="rail">
        <Brand />

        <div className="rail-recipient">
          <Face
            person={{
              avatar: recipient.avatar,
              initials: recipient.name.slice(0, 1).toUpperCase(),
              color: "var(--accent)",
            }}
            size={40}
          />
          <div>
            <strong>{recipient.name}</strong>
            <span>{recipient.relation === "Someone else" ? "Being cared for" : recipient.relation}</span>
          </div>
        </div>

        <nav className="rail-nav" aria-label="Main">
          {NAV.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#/${id}`} className="rail-link" aria-current={route === id ? "page" : undefined}>
              <Icon size={17} />
              {label}
              {id === "inbox" && waiting > 0 && (
                <span className="rail-count" aria-label={`${waiting} waiting`}>
                  {waiting}
                </span>
              )}
            </a>
          ))}
        </nav>

        <div className="rail-spacer" />

        <button type="button" className="btn btn-primary btn-block rail-add" onClick={() => setAdding(true)}>
          <Plus size={16} />
          Add a task
        </button>

        <a href="#/about" className="rail-link" aria-current={route === "about" ? "page" : undefined}>
          <Info size={17} />
          About Shoulder
        </a>

        <div className="rail-me">
          <Face person={me} size={30} />
          <span className="rail-me-name">{me?.name}</span>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </aside>

      <main className="work">
        {route === "tasks" && <Tasks onNavigate={navigate} onAdd={() => setAdding(true)} />}
        {route === "inbox" && <Inbox onNavigate={navigate} />}
        {route === "agreed" && <Agreed onNavigate={navigate} />}
        {route === "control" && <ControlPanel theme={theme} onToggleTheme={toggleTheme} />}
        {route === "about" && <About />}
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#/${id}`} aria-current={route === id ? "page" : undefined}>
            <Icon size={19} />
            {label === "Control Panel" ? "Control" : label}
            {id === "inbox" && waiting > 0 && <b className="tabbar-pip">{waiting}</b>}
          </a>
        ))}
        <button type="button" onClick={() => setAdding(true)}>
          <Plus size={19} />
          Add
        </button>
      </nav>

      {adding && <AddTaskModal onClose={() => setAdding(false)} onAdded={() => navigate("tasks")} />}
    </div>
  );
}
