import React from 'react';
import type { WatchHistoryItem } from '@video-player/shared';
import styles from './History.module.css';
import { HistoryCard } from './HistoryCard.js';

interface ContinueWatchingProps {
  items: WatchHistoryItem[];
  onPlay: (item: WatchHistoryItem) => void;
  onRefresh: (item: WatchHistoryItem) => Promise<void>;
  onRemove: (id: string) => void;
  onOpenDrawer: () => void;
}

export const ContinueWatching: React.FC<ContinueWatchingProps> = ({
  items,
  onPlay,
  onRefresh,
  onRemove,
  onOpenDrawer,
}) => {
  if (!items || items.length === 0) return null;

  // Show top 6 items in the home carousel
  const recentItems = items.slice(0, 6);

  return (
    <section className={styles.continueWatchingSection}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitleGroup}>
          <span className={styles.sectionIcon}>🕒</span>
          <h2 className={styles.sectionTitle}>Continue Watching</h2>
          <span className={styles.itemCountBadge}>{items.length}</span>
        </div>

        <button
          type="button"
          className={styles.viewAllBtn}
          onClick={onOpenDrawer}
          title="Open full watch history"
        >
          <span>View All</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>

      <div className={styles.carousel}>
        {recentItems.map((item) => (
          <div key={item.id} className={styles.carouselCard}>
            <HistoryCard
              item={item}
              onPlay={onPlay}
              onRefresh={onRefresh}
              onRemove={onRemove}
            />
          </div>
        ))}
      </div>
    </section>
  );
};
