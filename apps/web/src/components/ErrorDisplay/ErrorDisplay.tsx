import React, { useState } from 'react';
import styles from './ErrorDisplay.module.css';

interface ErrorDisplayProps {
  code?: string;
  message: string;
  detail?: string;
  onRetry?: () => void;
  onRefreshSource?: () => void;
  onDismiss?: () => void;
  onOpenBrowser?: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  code = 'ERROR',
  message,
  detail,
  onRetry,
  onRefreshSource,
  onDismiss,
  onOpenBrowser,
}) => {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className={styles.container} role="alert">
      <div className={styles.iconWrapper}>
        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>

      <div className={styles.content}>
        <div className={styles.titleRow}>
          <span className={styles.badge}>{code}</span>
          <span className={styles.title}>Playback / Resolution Failed</span>
        </div>

        <p className={styles.message}>{message}</p>

        {detail && (
          <div>
            <button
              onClick={() => setShowDetail(!showDetail)}
              style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textDecoration: 'underline' }}
            >
              {showDetail ? 'Hide technical details' : 'Show technical details'}
            </button>
            {showDetail && <div className={styles.detail}>{detail}</div>}
          </div>
        )}

        <div className={styles.actions}>
          {onRefreshSource && (
            <button
              className={styles.retryBtn}
              onClick={onRefreshSource}
              style={{
                backgroundColor: 'var(--accent)',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
              }}
              title="Re-resolve fresh streaming link from original source (useful if pre-signed link expired)"
            >
              <span>🔄 Refresh Link from Source</span>
            </button>
          )}
          {onOpenBrowser && (
            <button
              className={styles.retryBtn}
              onClick={onOpenBrowser}
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Open in embedded browser with 1DM-style media sniffer and ad blocker"
            >
              <span>🌐 Open in Browser Sniffer (1DM Mode)</span>
            </button>
          )}
          {onRetry && (
            <button className={styles.retryBtn} onClick={onRetry}>
              Try Again
            </button>
          )}
          {onDismiss && (
            <button className={styles.dismissBtn} onClick={onDismiss}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
