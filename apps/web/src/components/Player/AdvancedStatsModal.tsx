import React, { useState, useEffect } from 'react';
import type { StreamInfo } from '@video-player/shared';
import styles from './Player.module.css';
import { formatTime, formatBytes } from '../../utils/format.js';

export interface StreamStatsData {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  bufferedPercent: number;
  bufferedSecondsAhead: number;
  streamingSpeed?: number;
  downloadedBytes?: number;
  videoWidth: number;
  videoHeight: number;
  isPlaying: boolean;
  isBuffering: boolean;
  playbackRate: number;
  stream: StreamInfo;
  activeSource: string;
}

interface AdvancedStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: StreamStatsData;
}

export const AdvancedStatsModal: React.FC<AdvancedStatsModalProps> = ({
  isOpen,
  onClose,
  stats,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

  let host = '';
  try {
    host = new URL(stats.stream.url).hostname;
  } catch {}

  const aspectRatio =
    stats.videoWidth && stats.videoHeight
      ? `${(stats.videoWidth / stats.videoHeight).toFixed(2)}:1`
      : 'Auto';

  const isRemux = stats.activeSource.includes('/api/stream/remux');
  const isProxied = stats.activeSource.includes('/api/proxy') || isRemux;

  return (
    <div className={styles.statsOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.statsCard}>
        <div className={styles.statsHeader}>
          <div className={styles.statsTitle}>
            <span>📊 Stream Stats & Buffer Telemetry</span>
            <span className={styles.statsBadge}>
              {stats.isBuffering ? 'BUFFERING' : stats.isPlaying ? 'PLAYING' : 'PAUSED'}
            </span>
          </div>
          <button
            type="button"
            className={styles.statsCloseBtn}
            onClick={onClose}
            title="Close (D or Esc)"
            aria-label="Close Advanced Data"
          >
            ✕
          </button>
        </div>

        <div className={styles.statsBody}>

        {/* Section 1: Buffer & Download Progress */}
        <div className={styles.statsSection}>
          <div className={styles.statsSectionTitle}>📥 Download & Buffer Health</div>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Timeline Buffered</span>
              <span className={styles.statValueHighlight}>
                {stats.bufferedPercent.toFixed(1)}%
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Buffer Ahead</span>
              <span className={styles.statValueHighlight}>
                +{stats.bufferedSecondsAhead.toFixed(1)}s
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Buffered Range</span>
              <span className={styles.statValue}>
                0:00 - {formatTime(stats.bufferedEnd)}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Position / Duration</span>
              <span className={styles.statValue}>
                {formatTime(stats.currentTime)} / {formatTime(stats.duration)}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Live Stream Speed</span>
              <span className={styles.statValueHighlight}>
                {stats.streamingSpeed && stats.streamingSpeed > 0 ? `⚡ ${formatBytes(stats.streamingSpeed)}/s` : 'Paced (Idle / Steady)'}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Bandwidth Control</span>
              <span className={styles.statValue}>
                {isRemux ? 'Paced 1.5 MB/s (12 Mbps)' : 'Paced 1.5 MB/s (Chunked)'}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Data Streamed</span>
              <span className={styles.statValue}>
                {stats.downloadedBytes && stats.downloadedBytes > 0
                  ? stats.stream.size && stats.stream.size > 0
                    ? `${formatBytes(stats.downloadedBytes)} / ${formatBytes(stats.stream.size)} (${((stats.downloadedBytes / stats.stream.size) * 100).toFixed(1)}%)`
                    : formatBytes(stats.downloadedBytes)
                  : '0 B'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Video & Audio Specifications */}
        <div className={styles.statsSection}>
          <div className={styles.statsSectionTitle}>🎬 Media Stream Specifications</div>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Video Resolution</span>
              <span className={styles.statValue}>
                {stats.videoWidth && stats.videoHeight
                  ? `${stats.videoWidth} × ${stats.videoHeight}`
                  : 'Probing...'}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Aspect Ratio</span>
              <span className={styles.statValue}>{aspectRatio}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Stream Format</span>
              <span className={styles.statValue}>{stats.stream.label || stats.stream.type.toUpperCase()}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Container / MIME</span>
              <span className={styles.statValue}>{stats.stream.mimeType || 'video/mp4'}</span>
            </div>
          </div>
        </div>

        {/* Section 3: Network & Delivery Telemetry */}
        <div className={styles.statsSection}>
          <div className={styles.statsSectionTitle}>🌐 Network & Stream Delivery</div>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Media Host</span>
              <span className={styles.statValue}>{host || 'Remote CDN'}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Delivery Engine</span>
              <span className={styles.statValue}>
                {isRemux ? 'On-The-Fly MP4 Remux (Zero-Loss)' : isProxied ? 'Secure Range Proxy' : 'Direct Stream'}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Playback Speed</span>
              <span className={styles.statValue}>{stats.playbackRate}x</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>CORS / Proxy</span>
              <span className={styles.statValue}>Bypassed (Streamed Inline)</span>
            </div>
          </div>

          <div className={styles.statUrlRow}>
            <div className={styles.statUrlText} title={stats.stream.url}>
              <strong>Direct URL:</strong> {stats.stream.url}
            </div>
            <button
              type="button"
              className={styles.statCopyBtn}
              onClick={() => handleCopy(stats.stream.url, 'direct')}
            >
              {copiedKey === 'direct' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.statsFooter}>
        <span className={styles.statsHint}>
          Press <kbd>D</kbd> or <kbd>Esc</kbd> to close
        </span>
        <button
          type="button"
          className={styles.statsFooterCloseBtn}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  </div>
);
};
