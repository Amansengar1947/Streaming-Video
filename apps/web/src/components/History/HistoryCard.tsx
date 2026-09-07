import React, { useState } from 'react';
import type { WatchHistoryItem } from '@video-player/shared';
import styles from './History.module.css';
import { formatTime } from '../../utils/format.js';

interface HistoryCardProps {
  item: WatchHistoryItem;
  onPlay: (item: WatchHistoryItem) => void;
  onRefresh: (item: WatchHistoryItem) => Promise<void>;
  onRemove: (id: string) => void;
  className?: string;
}

export function formatTimeAgo(timestamp: number): string {
  const elapsed = Math.floor((Date.now() - timestamp) / 1000);
  if (elapsed < 60) return 'Just now';
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h ago`;
  if (elapsed < 604800) return `${Math.floor(elapsed / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export const HistoryCard: React.FC<HistoryCardProps> = ({
  item,
  onPlay,
  onRefresh,
  onRemove,
  className = '',
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const duration = item.duration > 0 ? item.duration : 0;
  const currentTime = item.currentTime > 0 ? item.currentTime : 0;
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleRefreshClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh(item);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(item.id);
  };

  const handlePlayClick = () => {
    onPlay(item);
  };

  return (
    <div className={`${styles.card} ${className}`}>
      {/* Thumbnail Area */}
      <div className={styles.thumbnailWrapper} onClick={handlePlayClick}>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={item.title} className={styles.thumbnailImg} loading="lazy" />
        ) : (
          <div className={styles.thumbnailPlaceholder}>
            <svg className={styles.placeholderIcon} viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
        )}

        <div className={styles.playOverlay}>
          <div className={styles.playCircleBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
        </div>

        {item.streamType && (
          <span className={styles.formatBadge}>{item.streamType}</span>
        )}

        {duration > 0 && (
          <span className={styles.durationBadge}>{formatTime(duration)}</span>
        )}
      </div>

      {/* Progress Bar under thumbnail */}
      {duration > 0 && (
        <div className={styles.cardProgressBarContainer}>
          <div
            className={styles.cardProgressBarFill}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Content Area */}
      <div className={styles.cardContent}>
        <div className={styles.cardTitle} onClick={handlePlayClick} title={item.title}>
          {item.title}
        </div>

        <div className={styles.cardMeta}>
          <span className={styles.progressText}>
            {duration > 0
              ? `${formatTime(currentTime)} / ${formatTime(duration)}`
              : currentTime > 0
              ? formatTime(currentTime)
              : 'Unplayed'}
          </span>
          <span className={styles.timeAgo}>{formatTimeAgo(item.lastWatched)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className={styles.cardActions}>
        <button
          type="button"
          className={styles.resumeBtn}
          onClick={handlePlayClick}
          title={currentTime > 5 ? `Resume playback from ${formatTime(currentTime)}` : 'Play video'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>{currentTime > 5 ? `Resume (${formatTime(currentTime)})` : 'Play'}</span>
        </button>

        <button
          type="button"
          className={`${styles.actionIconBtn} ${styles.refreshBtn}`}
          onClick={handleRefreshClick}
          title="Refresh stream link from original source (if expired)"
          disabled={isRefreshing}
        >
          <svg
            className={isRefreshing ? styles.spinning : ''}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </button>

        <button
          type="button"
          className={`${styles.actionIconBtn} ${styles.deleteBtn}`}
          onClick={handleRemoveClick}
          title="Remove from history"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};
