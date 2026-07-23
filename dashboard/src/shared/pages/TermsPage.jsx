import React from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

export default function TermsPage() {
  return (
    <div style={{
      maxWidth: '800px',
      margin: '60px auto',
      padding: 'var(--space-6)',
      backgroundColor: 'var(--surface-0)',
      color: 'var(--text-1)',
      fontFamily: 'var(--font-body)',
      lineHeight: '1.7',
      border: '1px solid var(--border-strong)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
    }}>
      {/* Go Back / Home */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <NavLink to="/overview" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          color: 'var(--text-2)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          border: '1px solid var(--border)',
          padding: 'var(--space-2) var(--space-4)',
          backgroundColor: 'var(--surface-1)',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }} className="hover-accent">
          <ArrowLeft size={12} />
          <span>&lt;&lt;&lt; BACK TO MISSION CONTROL</span>
        </NavLink>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', borderBottom: '1px solid var(--border-strong)', paddingBottom: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <ShieldAlert size={28} style={{ color: 'var(--accent-core)' }} />
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '28px',
            fontWeight: 'bold',
            letterSpacing: '1px',
            color: 'var(--text-1)',
            margin: 0
          }}>
            TERMS OF SERVICE // BẢN ĐIỀU KHOẢN DỊCH VỤ
          </h1>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-3)',
            margin: 0,
            marginTop: '2px'
          }}>
            SYSTEM DEPLOYMENT VERSION 2.3.9 • LAST REVISION: 2026-07-23
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent)', fontWeight: 'bold', marginBottom: 'var(--space-2)' }}>
            [01] CHẤP THUẬN ĐIỀU KHOẢN / ACCEPTANCE OF TERMS
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>
            Bằng việc thêm Bot vào máy chủ Discord của bạn hoặc truy cập trang quản trị này, bạn đồng ý tuân thủ toàn bộ các điều khoản dịch vụ và chính sách nhà phát triển của Discord. Nếu không đồng ý, vui lòng trục xuất (kick) Bot khỏi máy chủ.
          </p>
        </section>

        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent)', fontWeight: 'bold', marginBottom: 'var(--space-2)' }}>
            [02] NGUYÊN TẮC SỬ DỤNG / USE OF SERVICE
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>
            Nghiêm cấm mọi hành vi lạm dụng câu lệnh, spam lệnh nhạc/kinh tế, cố tình khai thác lỗ hổng hệ thống (exploit) hoặc tấn công vào máy chủ lưu trữ dữ liệu. Hệ thống có quyền tự động chặn (cooldown) hoặc khóa quyền sử dụng của người dùng vi phạm.
          </p>
        </section>

        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent)', fontWeight: 'bold', marginBottom: 'var(--space-2)' }}>
            [03] GIỚI HẠN TRÁCH NHIỆM / LIMITATION OF LIABILITY
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>
            Dịch vụ được cung cấp ở trạng thái "sẵn có" (As-Is). Nhà phát triển không chịu trách nhiệm đối với bất kỳ sự gián đoạn kết nối, mất mát dữ liệu tạm thời do sự cố hạ tầng hoặc các quyết định xử phạt từ phía Discord.
          </p>
        </section>

        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent)', fontWeight: 'bold', marginBottom: 'var(--space-2)' }}>
            [04] CẬP NHẬT ĐIỀU KHOẢN / MODIFICATIONS
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>
            Các điều khoản này có thể được điều chỉnh bất cứ lúc nào để phù hợp với quy định mới từ phía Discord Developer Policy. Việc tiếp tục sử dụng Bot đồng nghĩa với việc bạn đồng ý với các cập nhật mới.
          </p>
        </section>
      </div>
    </div>
  );
}
