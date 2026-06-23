import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  Activity, 
  Users, 
  Shield, 
  Terminal, 
  Coins, 
  BarChart2, 
  Server, 
  Sword, 
  Music, 
  Bell, 
  ChevronDown,
  Brain
} from 'lucide-react';

const Icons = {
  Activity,
  Users,
  Shield,
  Terminal,
  Coins,
  BarChart2,
  Server,
  Sword,
  Music,
  Bell,
  ChevronDown,
  Brain
};

import { NAVIGATION_SCHEMA } from './navigation.config.ts';

export default function DomainRail({ selectedGuild }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Find active domain by checking if location path matches any item's path
  const activeDomain = NAVIGATION_SCHEMA.find(domain =>
    domain.items.some(item => location.pathname.startsWith(item.to))
  ) ?? NAVIGATION_SCHEMA[0];

  // Helper to resolve icon component dynamically
  const renderIcon = (iconName, size = 16) => {
    const IconComponent = Icons[iconName];
    return IconComponent ? React.createElement(IconComponent, { size }) : React.createElement(Icons.Activity, { size });
  };

  const handleDomainChange = (domain) => {
    setDropdownOpen(false);
    // Navigate to the first item of the selected domain
    if (domain.items.length > 0) {
      navigate(domain.items[0].to);
    }
  };

  return (
    <nav className="domain-rail" aria-label="Domain Operations">
      {/* Guild Context Header */}
      <div className="domain-rail__header">
        {selectedGuild?.icon ? (
          <img
            src={selectedGuild.icon}
            alt=""
            style={{ width: '32px', height: '32px', border: '1px solid var(--border)' }}
          />
        ) : (
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold',
            fontFamily: 'var(--font-mono)'
          }}>
            {selectedGuild?.name ? selectedGuild.name.slice(0, 2).toUpperCase() : '??'}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-1)' }}>
            {selectedGuild?.name}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
            SECURE TERMINAL
          </span>
        </div>
      </div>

      {/* Domain Switcher Dropdown */}
      <div style={{ padding: 'var(--space-4) var(--space-4) var(--space-2) var(--space-4)', position: 'relative' }}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            width: '100%',
            backgroundColor: 'var(--surface-1)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-1)',
            padding: 'var(--space-2-5) var(--space-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{
              width: '6px',
              height: '6px',
              backgroundColor: activeDomain.id === 'core' ? 'var(--accent-core)' : 
                             activeDomain.id === 'riot' ? 'var(--accent-riot)' :
                             activeDomain.id === 'music' ? 'var(--accent-music)' : 'var(--accent-reminder)'
            }} />
            {activeDomain.label}
          </span>
          <Icons.ChevronDown size={14} style={{ color: 'var(--text-3)' }} />
        </button>

        {dropdownOpen && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '16px',
            right: '16px',
            backgroundColor: 'var(--surface-1)',
            border: '1px solid var(--border-strong)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column'
          }}>
            {NAVIGATION_SCHEMA.map(domain => (
              <button
                key={domain.id}
                onClick={() => handleDomainChange(domain)}
                style={{
                  width: '100%',
                  padding: 'var(--space-2-5) var(--space-3)',
                  backgroundColor: activeDomain.id === domain.id ? 'var(--surface-2)' : 'transparent',
                  border: 'none',
                  color: activeDomain.id === domain.id ? 'var(--text-1)' : 'var(--text-2)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-half)'
                }}
              >
                <span style={{ fontWeight: 'bold' }}>{domain.label}</span>
                <span style={{ fontSize: '9px', color: 'var(--text-3)' }}>{domain.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation Links for Active Domain */}
      <div className="domain-rail__content">
        <div>
          <div className="domain-rail__section-title">ACTIVE WORKSPACE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {activeDomain.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `btn`}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: 'var(--space-2-5)',
                  padding: 'var(--space-2-5) var(--space-3)',
                  backgroundColor: isActive ? 'var(--surface-2)' : 'transparent',
                  borderLeft: isActive ? `3px solid ${
                    activeDomain.id === 'core' ? 'var(--accent-core)' : 
                    activeDomain.id === 'riot' ? 'var(--accent-riot)' :
                    activeDomain.id === 'music' ? 'var(--accent-music)' : 'var(--accent-reminder)'
                  }` : '3px solid transparent',
                  color: isActive ? 'var(--text-1)' : 'var(--text-2)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  textAlign: 'left',
                  cursor: 'pointer'
                })}
              >
                {renderIcon(item.icon, 14)}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
