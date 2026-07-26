import React from 'react';
import { Bot, Shield, Music, Trophy, Coins, ArrowRight, ExternalLink, Activity, Lock } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function LandingPage() {
  const { t, language, setLanguage } = useLanguage();

  const handleLogin = () => {
    window.location.href = '/auth/login';
  };

  return (
    <div className="boot-loader-bg" style={{ minHeight: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', color: 'var(--text-1)', fontFamily: 'var(--font-body)' }}>
      <div className="scanline-overlay" />

      {/* Top Ticker Status Bar */}
      <div style={{ backgroundColor: 'var(--surface-1)', borderBottom: '1px solid var(--border)', padding: '6px 24px', fontSize: '10px', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="pulse-led" />
          <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>SYSTEM STATUS: OPERATIONAL</span>
          <span>|</span>
          <span>LATENCY: 12ms</span>
          <span>|</span>
          <span>SHARDS: 4/4 ACTIVE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
            style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '10px' }}
          >
            LANG: [{language.toUpperCase()}]
          </button>
          <span>BUILD v4.0.0</span>
        </div>
      </div>

      {/* Main Header Nav */}
      <header style={{ padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', backgroundColor: 'var(--surface-0)' }}>
            <Bot size={22} />
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', letterSpacing: '0.08em', margin: 0, lineHeight: 1 }}>
              DISCORD SERVICE BOT
            </h1>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
              MISSION CONTROL PLATFORM
            </span>
          </div>
        </div>

        <button 
          onClick={handleLogin}
          className="btn btn--primary"
          style={{ padding: '10px 20px', fontFamily: 'var(--font-mono)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span>{t("AUTHENTICATE SESSION")}</span>
          <ArrowRight size={14} />
        </button>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1, maxWidth: '1200px', margin: '0 auto', padding: '60px 24px', display: 'flex', flexDirection: 'column', gap: '60px' }}>
        
        <section style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', border: '1px solid var(--border-strong)', backgroundColor: 'var(--surface-0)', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
            <Lock size={12} />
            <span>SECURE ENTERPRISE COMMUNITY MANAGEMENT</span>
          </div>

          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 6vw, 64px)', letterSpacing: '0.05em', lineHeight: 1.1, margin: 0, textTransform: 'uppercase' }}>
            Nền Tảng Quản Lý Discord Server <br />
            <span style={{ color: 'var(--accent)' }}>Chuyên Nghiệp & Toàn Diện</span>
          </h2>

          <p style={{ maxWidth: '680px', fontSize: '15px', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
            Tích hợp toàn bộ công cụ vận hành Server: Bảo vệ AutoMod tự động, Trình phát nhạc chất lượng cao, Thống kê Esports & Riot Games, Hệ thống XP Kinh tế và Quản lý Ticket Hỗ trợ.
          </p>

          <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
            <button 
              onClick={handleLogin}
              className="btn btn--primary"
              style={{ padding: '14px 32px', fontSize: '14px', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}
            >
              🚀 {t("LOGIN WITH DISCORD")}
            </button>
            <a 
              href="#features"
              className="btn btn--secondary"
              style={{ padding: '14px 28px', fontSize: '14px', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}
            >
              {t("KHÁM PHÁ TÍNH NĂNG")}
            </a>
          </div>
        </section>

        {/* Feature Grid */}
        <section id="features" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
          
          <div className="panel" style={{ borderTop: '2px solid var(--red)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={20} style={{ color: 'var(--red)' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', margin: 0 }}>AUTOMOD PROTOCOL</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              Bảo vệ Server 24/7 với Anti-Spam, Anti-Link, Anti-Raid và bộ lọc từ cấm tùy chỉnh. Tự động xóa tin nhắn vi phạm và phạt thành viên.
            </p>
          </div>

          <div className="panel" style={{ borderTop: '2px solid var(--yellow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Music size={20} style={{ color: 'var(--yellow)' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', margin: 0 }}>MUSIC & VOICE ENGINE</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              Phát nhạc độ phân giải cao từ YouTube/Spotify, quản lý hàng chờ thông minh và tự động tạo Kênh Voice Tạm thời (Temp VC) khi có thành viên vào.
            </p>
          </div>

          <div className="panel" style={{ borderTop: '2px solid var(--accent-riot)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Trophy size={20} style={{ color: 'var(--accent-riot)' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', margin: 0 }}>ESPORTS & RIOT API</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              Tra cứu rank Valorant/LoL trực tiếp qua Riot API, tự động cập nhật lịch thi đấu Esport giải đấu và Bảng xếp hạng thành viên trong Server.
            </p>
          </div>

          <div className="panel" style={{ borderTop: '2px solid var(--accent-reminder)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Coins size={20} style={{ color: 'var(--accent-reminder)' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', margin: 0 }}>ECONOMY & TICKETS</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              Tăng tương tác với hệ thống XP Leveling, thưởng điểm danh Daily, Bảng chọn Self-Roles tự gán Role và Kênh Ticket Hỗ trợ chuyên nghiệp.
            </p>
          </div>

        </section>

      </main>

      {/* Footer */}
      <footer style={{ padding: '24px 40px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--surface-0)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
        <div>
          © 2026 DISCORD SERVICE BOT. ALL RIGHTS RESERVED.
        </div>
        <div style={{ display: 'flex', gap: '24px' }}>
          <a href="/terms" style={{ color: 'var(--text-2)', textDecoration: 'none' }}>Điều khoản dịch vụ (Terms)</a>
          <a href="/privacy" style={{ color: 'var(--text-2)', textDecoration: 'none' }}>Chính sách bảo mật (Privacy)</a>
        </div>
      </footer>
    </div>
  );
}
