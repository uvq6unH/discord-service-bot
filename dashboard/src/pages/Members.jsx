import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, ThemeToggle} from '../components/ui.jsx';
import { useAppTheme } from '../App.jsx';
import { api } from '../api.js';

function getDefaultAvatarIndex(id) {
  try {
    // BigInt() throw nếu id undefined hoặc không phải số hợp lệ — guard lại
    return Number(BigInt(id || '0') % 5n);
  } catch {
    return 0;
  }
}

function MemberRow({ member }) {
  const { theme, toggleTheme } = useAppTheme();
  return (
    <div className="member-row">
      <img
        className="member-avatar"
        src={member.avatar
          ? `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png?size=32`
          : `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(member.id)}.png`
        }
        alt=""
      />
      <div className="member-info">
        <span className="member-name">{member.displayName ?? member.username}</span>
        <span className="member-tag">{member.username}</span>
      </div>
      <div className="member-joined">
        {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString('vi-VN') : '—'}
      </div>
    </div>
  );
}

export default function MembersPage() {
  const { selectedGuild } = useGuild();
  const [members, setMembers]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const load = useCallback(async (p = 1, q = '') => {
    if (!selectedGuild) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.members(selectedGuild.id, p, q);
      setMembers(data.members ?? []);
      setTotal(data.total ?? 0);
      setPage(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedGuild]);

  useEffect(() => { load(1, ''); }, [load]);

  // Debounce 300ms — tránh gửi HTTP request cho mỗi keystroke
  const debounceTimer = useRef(null);
  const handleSearch = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => load(1, val), 300);
  };

  // Cleanup debounce khi unmount
  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  const pageCount = Math.ceil(total / 20);

  return (
    <div className="page">
      <div className="page-header-row">
        <h1 className="page-title">Thành viên</h1>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
      <p className="page-subtitle">{total} thành viên</p>

      <div className="members-toolbar">
        <div className="search-box">
          <i className="ti ti-search" />
          <input
            className="form-input"
            placeholder="Tìm thành viên…"
            value={search}
            onChange={handleSearch}
          />
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading
        ? <div className="page-loading"><Spinner /></div>
        : (
          <div className="member-list">
            <div className="member-list-header">
              <span>Thành viên</span>
              <span>Ngày tham gia</span>
            </div>
            {members.map(m => <MemberRow key={m.id} member={m} />)}
          </div>
        )
      }

      {pageCount > 1 && (
        <div className="pagination">
          <button
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => load(page - 1, search)}
          >
            ← Trước
          </button>
          <span className="pagination-info">{page} / {pageCount}</span>
          <button
            className="btn btn-secondary"
            disabled={page >= pageCount}
            onClick={() => load(page + 1, search)}
          >
            Tiếp →
          </button>
        </div>
      )}
    </div>
  );
}
