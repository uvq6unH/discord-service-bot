import React from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function PrivacyPage() {
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
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
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
        <ShieldCheck size={28} style={{ color: 'var(--green)' }} />
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '28px',
            fontWeight: 'bold',
            letterSpacing: '1px',
            color: 'var(--text-1)',
            margin: 0
          }}>
            PRIVACY POLICY // CHÍNH SÁCH BẢO MẬT
          </h1>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-3)',
            margin: 0,
            marginTop: '2px'
          }}>
            SECURITY AUDIT DEPLOYMENT • LAST REVISION: 2026-07-23
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--green)', fontWeight: 'bold', marginBottom: 'var(--space-2)' }}>
            [01] THÔNG TIN THU THẬP / DATA COLLECTED
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>
            Hệ thống chỉ lưu trữ và xử lý những thông tin tối thiểu cần thiết để vận hành các chức năng của Bot:
          </p>
          <ul style={{ color: 'var(--text-2)', fontSize: '13px', marginLeft: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
            <li><strong>Thông tin máy chủ (Guild Data):</strong> ID máy chủ, tên máy chủ, danh sách kênh phục vụ việc lưu cấu hình và xuất log hệ thống.</li>
            <li><strong>Thông tin người dùng (User Telemetry):</strong> ID người dùng Discord, điểm kinh nghiệm (XP/Level), số dư ví kinh tế ảo và nhật ký cảnh báo từ quản trị viên.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--green)', fontWeight: 'bold', marginBottom: 'var(--space-2)' }}>
            [02] CÁCH THỨC SỬ DỤNG DỮ LIỆU / DATA UTILITY
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>
            Dữ liệu thu thập được lưu giữ hoàn toàn khép kín và an toàn trên cơ sở dữ liệu Upstash Cloud Redis. Chúng tôi cam kết không chia sẻ, mua bán hoặc tiết lộ thông tin này cho bất kỳ bên thứ ba nào. Dữ liệu chỉ dùng để hiển thị lên bảng điều khiển Dashboard và phục vụ các trò chơi mô phỏng trên Discord.
          </p>
        </section>

        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--green)', fontWeight: 'bold', marginBottom: 'var(--space-2)' }}>
            [03] QUYỀN YÊU CẦU XÓA DỮ LIỆU / DATA DELETION
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>
            Nếu bạn muốn xóa toàn bộ dữ liệu cấu hình hoặc lịch sử hoạt động của máy chủ của mình khỏi cơ sở dữ liệu, vui lòng kick Bot khỏi server hoặc liên hệ trực tiếp với Quản trị viên hệ thống để thực hiện dọn dẹp (clean-up) lập tức.
          </p>
        </section>
      </div>
    </div>
  );
}
