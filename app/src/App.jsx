import React, { useState, useEffect } from "react";
import { Store, PERSON_META, subscribeStore } from "./data/store.js";
import {
  Calendar,
  User,
  Bell,
  Shield,
  Moon,
  Sun,
  Clock,
  Info,
  Sliders,
  ChevronRight,
} from "./components/Icons.jsx";
import Schedule from "./screens/Schedule.jsx";
import Limits from "./screens/Limits.jsx";
import Inbox from "./screens/Inbox.jsx";
import Agreements from "./screens/Agreements.jsx";
import AgentVault from "./screens/AgentVault.jsx";
import Activity from "./screens/Activity.jsx";
import HowItWorks from "./screens/HowItWorks.jsx";

const PRIMARY_NAV = [
  { id: "schedule", label: "Schedule", icon: Calendar },
  { id: "inbox", label: "Needs You", icon: Bell },
  { id: "limits", label: "My Limits", icon: Sliders },
  { id: "agreements", label: "Agreements", icon: Shield },
];

const SECONDARY_NAV = [
  { id: "agent", label: "Your Agent", icon: LockIcon },
  { id: "activity", label: "Activity", icon: Clock },
  { id: "how-it-works", label: "How It Works", icon: Info },
];

function LockIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function getHashRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const allRoutes = [...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => item.id);
  return allRoutes.includes(hash) ? hash : "schedule";
}

export default function App() {
  const [route, setRoute] = useState(getHashRoute);
  const [activeUser, setActiveUser] = useState(Store.getActiveUser());
  const [openCardsCount, setOpenCardsCount] = useState(Store.getOpenEscalations().length);
  const [showSecondaryMenu, setShowSecondaryMenu] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("shoulder_theme_v2") || "light";
  });

  useEffect(() => {
    const handleHash = () => {
      setRoute(getHashRoute());
      setShowSecondaryMenu(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("shoulder_theme_v2", theme);
  }, [theme]);

  useEffect(() => {
    return subscribeStore(() => {
      setActiveUser(Store.getActiveUser());
      setOpenCardsCount(Store.getOpenEscalations().length);
    });
  }, []);

  const navigate = (id) => {
    window.location.hash = `#/${id}`;
  };

  const handleUserChange = (e) => {
    Store.setActiveUser(e.target.value);
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const userMeta = PERSON_META[activeUser] || PERSON_META.farah;
  const isSecondaryActive = SECONDARY_NAV.some((item) => item.id === route);

  return (
    <div className="consumer-app-shell">
      {/* 1. COMPACT VISUAL APP HEADER */}
      <header className="app-top-header">
        <div className="header-brand-wrap">
          <a href="#/schedule" className="brand-link">
            <span className="brand-name">Shoulder</span>
            <span className="brand-divider">·</span>
            <span className="brand-family-label">Caring for Mum</span>
          </a>
        </div>

        <div className="header-controls-wrap">
          {/* Sibling Persona Selector */}
          <div className="active-user-pill">
            <span className="user-avatar-badge" style={{ background: userMeta.color }}>
              {userMeta.shortName[0]}
            </span>
            <select
              className="user-select-native"
              value={activeUser}
              onChange={handleUserChange}
              aria-label="Switch family member view"
            >
              <option value="farah">Farah (You)</option>
              <option value="amina">Amina</option>
              <option value="rian">Rian</option>
            </select>
          </div>

          {/* Theme Toggle */}
          <button
            className="header-icon-btn"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* 2. PRIMARY APP NAVIGATION */}
      <nav className="primary-navigation" aria-label="Main Navigation">
        <div className="primary-nav-left">
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = route === item.id;
            const isInbox = item.id === "inbox";

            return (
              <a
                key={item.id}
                href={`#/${item.id}`}
                className={`main-nav-tab ${isActive ? "active" : ""}`}
              >
                <Icon size={15} />
                <span>{item.label}</span>
                {isInbox && openCardsCount > 0 && (
                  <span className="attention-counter-dot">{openCardsCount}</span>
                )}
              </a>
            );
          })}
        </div>

        {/* Secondary / Transparency Trigger */}
        <div className="secondary-nav-wrap">
          <button
            className={`secondary-nav-trigger ${isSecondaryActive ? "active" : ""}`}
            onClick={() => setShowSecondaryMenu(!showSecondaryMenu)}
            aria-expanded={showSecondaryMenu}
          >
            <span>Transparency</span>
            <span className="dropdown-caret">▾</span>
          </button>

          {showSecondaryMenu && (
            <div className="secondary-menu-dropdown">
              <a
                href="#/agent"
                className={`secondary-menu-item ${route === "agent" ? "active" : ""}`}
                onClick={() => setShowSecondaryMenu(false)}
              >
                <LockIcon size={14} />
                <div>
                  <div className="menu-item-title">Your Agent</div>
                  <div className="menu-item-sub">Privacy vault & filter</div>
                </div>
              </a>

              <a
                href="#/activity"
                className={`secondary-menu-item ${route === "activity" ? "active" : ""}`}
                onClick={() => setShowSecondaryMenu(false)}
              >
                <Clock size={14} />
                <div>
                  <div className="menu-item-title">Activity Timeline</div>
                  <div className="menu-item-sub">Automated coordination log</div>
                </div>
              </a>

              <a
                href="#/how-it-works"
                className={`secondary-menu-item ${route === "how-it-works" ? "active" : ""}`}
                onClick={() => setShowSecondaryMenu(false)}
              >
                <Info size={14} />
                <div>
                  <div className="menu-item-title">How Shoulder Works</div>
                  <div className="menu-item-sub">The fair division model</div>
                </div>
              </a>
            </div>
          )}
        </div>
      </nav>

      {/* 3. MAIN PAGE CONTENT */}
      <main className="content-container">
        {route === "schedule" && <Schedule activeUser={activeUser} onNavigate={navigate} />}
        {route === "inbox" && <Inbox activeUser={activeUser} onNavigate={navigate} />}
        {route === "limits" && <Limits activeUser={activeUser} onNavigate={navigate} />}
        {route === "agreements" && <Agreements activeUser={activeUser} onNavigate={navigate} />}
        {route === "agent" && <AgentVault activeUser={activeUser} onNavigate={navigate} />}
        {route === "activity" && <Activity onNavigate={navigate} />}
        {route === "how-it-works" && <HowItWorks onNavigate={navigate} />}
      </main>

      {/* 4. MOBILE BOTTOM NAVIGATION */}
      <nav className="mobile-bottom-bar" aria-label="Mobile Navigation">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = route === item.id;
          const isInbox = item.id === "inbox";

          return (
            <a
              key={item.id}
              href={`#/${item.id}`}
              className={`mobile-bar-tab ${isActive ? "active" : ""}`}
            >
              <div className="mobile-tab-icon-wrap">
                <Icon size={18} />
                {isInbox && openCardsCount > 0 && (
                  <span className="mobile-attention-badge">{openCardsCount}</span>
                )}
              </div>
              <span className="mobile-tab-label">{item.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
