import React from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import { useGuild } from '../hooks/useGuild.js';
import { useMembers } from '../hooks/useMembers.js';
import { Search } from 'lucide-react';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

function getDefaultAvatarIndex(id) {
  try {
    return Number(BigInt(id || '0') % 5n);
  } catch {
    return 0;
  }
}

export default function MembersPage() {
  const { selectedGuild } = useGuild();
  const {
    members,
    total,
    pageCount,
    loading,
    page,
    setPage,
    search,
    handleSearch
  } = useMembers(selectedGuild?.id);
  const { t } = useLanguage();

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title={t("MEMBERS REGISTRY")}
        subtitle={t("Operational directory of all registered server member accounts.")}
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label={t("Total Guild Accounts")} 
          value={total} 
          sub={t("DB_MEMBER_COUNT")}
        />
        <KpiTile 
          label={t("Active Session Page")} 
          value={`${page} / ${Math.max(pageCount, 1)}`} 
          sub={t("REGISTRY_PAGINATION")}
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        <div className="col-span-12">
          <Panel title={t("REGISTRY DATABASE SEARCH")} accent>
            {/* Search Input Box */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', border: '1px solid var(--border)', padding: 'var(--space-2-5) var(--space-3-5)', backgroundColor: 'var(--surface-1)' }}>
              <Search size={16} style={{ color: 'var(--text-3)' }} />
              <input
                className="form-input"
                style={{ border: 'none', background: 'transparent', padding: 0 }}
                placeholder={t("Query member handle or ID...")}
                value={search}
                onChange={e => handleSearch(e.target.value)}
              />
            </div>

            {/* Members List Table */}
            {loading ? (
              <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-3)' }}>
                {t("QUERYING DATABASE RECORD SETS...")}
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                {/* Table Header */}
                <div className="member-list-header" style={{
                  padding: 'var(--space-3) var(--space-4)',
                  backgroundColor: 'var(--surface-1)',
                  borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: 'var(--text-3)'
                }}>
                  <span>{t("AVATAR")}</span>
                  <span>{t("MEMBER")}</span>
                  <span style={{ textAlign: 'right' }}>{t("TIMESTAMP JOINED")}</span>
                </div>

                {/* Table Rows */}
                {members.map(member => (
                  <div
                    key={member.id}
                    className="member-list-row"
                    style={{
                      alignItems: 'center',
                      padding: 'var(--space-3) var(--space-4)',
                      borderBottom: '1px solid var(--border)',
                      fontSize: '13px'
                    }}
                  >
                    <img
                      src={member.avatar
                        ? `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png?size=64`
                        : `https://discordapp.com/embed/avatars/${getDefaultAvatarIndex(member.id)}.png`
                      }
                      alt=""
                      style={{ width: '24px', height: '24px', border: '1px solid var(--border)' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-1)' }}>
                        {member.displayName ?? member.username}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)', fontSize: '11px' }}>
                        @{member.username}
                      </span>
                    </div>
                    <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-3)' }}>
                      {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString('vi-VN') : '—'}
                    </span>
                  </div>
                ))}

                {members.length === 0 && (
                  <div style={{ padding: 'var(--space-6)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-3)' }}>
                    {t("NO DATA MATCHED THE RECORD QUERY.")}
                  </div>
                )}
              </div>
            )}

            {/* Pagination controls */}
            {pageCount > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)' }}>
                <button
                  className="btn btn--secondary"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  &lt; prev
                </button>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  {t("PAGE {page} OF {pageCount}").replace("{page}", page).replace("{pageCount}", pageCount)}
                </span>
                <button
                  className="btn btn--secondary"
                  disabled={page >= pageCount}
                  onClick={() => setPage(p => p + 1)}
                >
                  next &gt;
                </button>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
