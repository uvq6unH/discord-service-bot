import { Search } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGuild } from '../../services/guild/GuildContext.jsx';
import { Spinner} from '../../../components/ui.jsx';

import { api } from '../../services/api/index.js';

function getDefaultAvatarIndex(id) {
  try {
    // BigInt() throw nếu id undefined hoặc không phải số hợp lệ — guard lại
    return Number(BigInt(id || '0') % 5n);
  } catch {
    return 0;
  }
}

function MemberRow({ member }) {
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
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce 300ms — tránh query mỗi keystroke
  const debounceTimer = useRef(null);
  const handleSearch = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 300);
  };
  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  const { data, isLoading: loading, isError, error } = useQuery({
    queryKey: ['members', selectedGuild?.id, page, debouncedSearch],
    queryFn: () => api.members(selectedGuild.id, page, debouncedSearch),
    enabled: !!selectedGuild,
    placeholderData: (prev) => prev,  // giữ data cũ khi fetch trang mới — tránh flash
  });

  const members   = data?.members ?? [];
  const total     = data?.total ?? 0;
  const pageCount = Math.ceil(total / 20);

  return (
    <div className="page">
      <div className="page-header">
      <div className="page-header-row">
        <h1 className="page-title">Thành viên</h1>
      </div>
      <p className="page-subtitle">{total} thành viên</p>
      </div>

      <div className="members-toolbar">
        <div className="search-box">
          <Search size={14} />
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
            onClick={() => setPage(p => p - 1)}
          >
            ← Trước
          </button>
          <span className="pagination-info">{page} / {pageCount}</span>
          <button
            className="btn btn-secondary"
            disabled={page >= pageCount}
            onClick={() => setPage(p => p + 1)}
          >
            Tiếp →
          </button>
        </div>
      )}
    </div>
  );
}
