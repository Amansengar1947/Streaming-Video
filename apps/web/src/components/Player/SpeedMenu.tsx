import React, { useState, useRef, useEffect } from 'react';
import styles from './Player.module.css';

interface SpeedMenuProps {
  currentRate: number;
  onSelectRate: (rate: number) => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export const SpeedMenu: React.FC<SpeedMenuProps> = ({ currentRate, onSelectRate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className={styles.menuWrapper} ref={menuRef}>
      <button
        type="button"
        className={styles.ctrlBtnText}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Playback speed"
        title="Playback Speed"
      >
        <span>{currentRate}x</span>
      </button>

      {isOpen && (
        <div className={styles.dropdownMenu}>
          <div className={styles.menuHeader}>Playback Speed</div>
          {SPEED_OPTIONS.map((rate) => (
            <button
              key={rate}
              type="button"
              className={`${styles.menuItem} ${currentRate === rate ? styles.menuItemActive : ''}`}
              onClick={() => {
                onSelectRate(rate);
                setIsOpen(false);
              }}
            >
              <span>{rate === 1.0 ? '1x (Normal)' : `${rate}x`}</span>
              {currentRate === rate && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
