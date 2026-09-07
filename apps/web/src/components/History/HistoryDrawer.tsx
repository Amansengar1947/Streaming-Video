import React, { useState, useEffect } from 'react';
import type { WatchHistoryItem } from '@video-player/shared';
import styles from './History.module.css';
import { HistoryCard } from './HistoryCard.js';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: WatchHistoryItem[];
  onPlay: (item: WatchHistoryItem) => void;
  onRefresh: (item: WatchHistoryItem) => Promise<void>;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onPlay,
  onRefresh,
  onRemove,
  onClearAll,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.originalUrl.toLowerCase().includes(q)
    );
  });

  const handleClearAllConfirm = () => {
    if (window.confirm('Are you sure you want to clear your entire watch history?')) {
      onClearAll();
    }
  };

  return (
    <div className={styles.drawerOverlay} onClick={onClose}>
      <div className={styles.drawerContainer} onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerHeaderTitle}>
            <span>🕒 Watch History</span>
            <span className={styles.itemCountBadge}>{items.length}</span>
          </div>

          <div className={styles.drawerActions}>
            {items.length > 0 && (
              <button
                type="button"
                className={styles.clearAllBtn}
                onClick={handleClearAllConfirm}
                title="Clear all watch history"
              >
                Clear All
              </button>
            )}
            <button
              type="button"
              className={styles.closeDrawerBtn}
              onClick={onClose}
              title="Close history drawer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search Bar */}
        {items.length > 3 && (
          <div className={styles.drawerSearch}>
            <div className={styles.searchInputWrapper}>
              <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search watched videos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Items List */}
        <div className={styles.drawerBody}>
          {filteredItems.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🎬</div>
              <div className={styles.emptyTitle}>
                {searchQuery ? 'No matching videos found' : 'No watch history yet'}
              </div>
              <div className={styles.emptySubtitle}>
                {searchQuery
                  ? `No videos match "${searchQuery}". Try a different search term.`
                  : 'Videos you play will automatically appear here with your saved timestamps so you can resume anytime.'}
              </div>
            </div>
          ) : (
            filteredItems.map((item) => (
              <HistoryCard
                key={item.id}
                item={item}
                onPlay={(selected) => {
                  onPlay(selected);
                  onClose();
                }}
                onRefresh={onRefresh}
                onRemove={onRemove}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
