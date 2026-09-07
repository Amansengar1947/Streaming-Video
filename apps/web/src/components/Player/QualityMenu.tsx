import React, { useState, useRef, useEffect } from 'react';
import styles from './Player.module.css';

export interface QualityTrack {
  id: number | string;
  label: string;
  width?: number;
  height?: number;
  bitrate?: number;
  active?: boolean;
}

interface QualityMenuProps {
  tracks: QualityTrack[];
  selectedTrackId: number | string | 'auto';
  onSelectTrack: (id: number | string | 'auto') => void;
}

export const QualityMenu: React.FC<QualityMenuProps> = ({
  tracks,
  selectedTrackId,
  onSelectTrack,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  if (tracks.length === 0) {
    return null;
  }

  const currentLabel =
    selectedTrackId === 'auto'
      ? 'Auto'
      : tracks.find((t) => t.id === selectedTrackId)?.label || 'Quality';

  return (
    <div className={styles.menuWrapper} ref={menuRef}>
      <button
        type="button"
        className={styles.ctrlBtnText}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Video Quality"
        title="Quality Selection"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
        <span>{currentLabel}</span>
      </button>

      {isOpen && (
        <div className={styles.dropdownMenu}>
          <div className={styles.menuHeader}>Quality</div>
          {/* Auto (ABR) option */}
          <button
            type="button"
            className={`${styles.menuItem} ${selectedTrackId === 'auto' ? styles.menuItemActive : ''}`}
            onClick={() => {
              onSelectTrack('auto');
              setIsOpen(false);
            }}
          >
            <span>Auto (Adaptive)</span>
            {selectedTrackId === 'auto' && <span>✓</span>}
          </button>

          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              className={`${styles.menuItem} ${selectedTrackId === track.id ? styles.menuItemActive : ''}`}
              onClick={() => {
                onSelectTrack(track.id);
                setIsOpen(false);
              }}
            >
              <span>{track.label}</span>
              {selectedTrackId === track.id && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
