import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          height: '100%', gap: 16, padding: 32,
          color: 'var(--text-2)',
        }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <h3 style={{ color: 'var(--text-1)', margin: 0 }}>Trang này gặp lỗi</h3>
          <p style={{ margin: 0, textAlign: 'center', maxWidth: 360 }}>
            {this.state.error?.message ?? 'Lỗi không xác định'}
          </p>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
