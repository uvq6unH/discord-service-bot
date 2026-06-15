/**
 * shared/layouts/DomainNav.jsx — Community Operations Platform
 * Phase 3: Replaces PluginNav with domain-aware navigation
 *
 * Layout:
 * - Guild header (icon + name)
 * - Domain section label
 * - Pages within current domain
 * - Domain switcher at bottom
 * - Theme picker
 */
import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { useGuild } from '../../../contexts/GuildContext.jsx';
import { ThemePicker } from '../../../components/ui.jsx';
import { DOMAINS, getDomainByPath } from './domains.js';

function DomainSwitcher({ currentDomain, onSelect }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="domain-switcher">
      <button
        className="domain-switcher__trigger"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span className="domain-switcher__label">{currentDomain.label}</span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          style={{
            transition: 'transform 0.2s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="domain-switcher__menu"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            {DOMAINS.map(domain => (
              <button
                key={domain.id}
                className={`domain-switcher__item ${domain.id === currentDomain.id ? 'domain-switcher__item--active' : ''}`}
                onClick={() => {
                  onSelect(domain);
                  setOpen(false);
                }}
              >
                <span className="domain-switcher__item-label">{domain.label}</span>
                <span className="domain-switcher__item-desc">{domain.description}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DomainNav() {
  const { selectedGuild } = useGuild();
  const location = useLocation();
  const [activeDomain, setActiveDomain] = useState(() => getDomainByPath(location.pathname));

  // Sync domain on navigation
  React.useEffect(() => {
    const d = getDomainByPath(location.pathname);
    if (d) setActiveDomain(d);
  }, [location.pathname]);

  if (!selectedGuild) return null;

  return (
    <nav className="domain-nav">
      {/* Guild header */}
      <div className="domain-nav__guild">
        {selectedGuild.icon ? (
          <img
            src={selectedGuild.icon}
            alt=""
            className="domain-nav__guild-icon"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="domain-nav__guild-icon--text">
            {selectedGuild.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="domain-nav__guild-info">
          <span className="domain-nav__guild-name">{selectedGuild.name}</span>
          <span className="domain-nav__guild-domain">{activeDomain.label}</span>
        </div>
      </div>

      {/* Domain switcher */}
      <DomainSwitcher
        currentDomain={activeDomain}
        onSelect={setActiveDomain}
      />

      {/* Section label */}
      <div className="domain-nav__section-label">{activeDomain.label}</div>

      {/* Pages in current domain */}
      <div className="domain-nav__pages">
        {activeDomain.pages.map(({ to, Icon, label }, index) => (
          <motion.div
            key={to}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.035, duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <NavLink
              to={to}
              className={({ isActive }) => `domain-nav__item${isActive ? ' active' : ''}`}
            >
              <Icon size={15} strokeWidth={1.75} />
              <span>{label}</span>
            </NavLink>
          </motion.div>
        ))}
      </div>

      {/* Theme picker */}
      <div className="domain-nav__footer">
        <ThemePicker />
      </div>
    </nav>
  );
}
