import React from 'react';

export default function Login() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <i className="ti ti-robot" />
        </div>
        <h1>Bot Dashboard</h1>
        <p>Đăng nhập bằng tài khoản Discord để quản lý bot.</p>
        <a href="/auth/login" className="btn btn-discord">
          <i className="ti ti-brand-discord" />
          Đăng nhập với Discord
        </a>
      </div>
    </div>
  );
}
