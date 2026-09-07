import React, { useEffect } from 'react';
import styles from './ShortcutsModal.module.css';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { label: 'Play / Pause', keys: ['Space', 'K'] },
  { label: 'Seek backward / forward 5s', keys: ['←', '→'] },
  { label: 'Seek backward / forward 10s', keys: ['Shift + ←', 'Shift + →'] },
  { label: 'Volume Up / Down 5%', keys: ['↑', '↓'] },
  { label: 'Toggle Mute', keys: ['M'] },
  { label: 'Toggle Fullscreen', keys: ['F'] },
  { label: 'Picture-in-Picture', keys: ['P'] },
  { label: 'Jump to 0% – 90% of duration', keys: ['0 – 9'] },
  { label: 'Advanced Stats / Data', keys: ['D'] },
  { label: 'Show this Help', keys: ['?'] },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Keyboard Shortcuts</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.content}>
          {SHORTCUTS.map((s) => (
            <div key={s.label} className={styles.shortcutRow}>
              <span className={styles.actionLabel}>{s.label}</span>
              <div className={styles.keys}>
                {s.keys.map((k) => (
                  <kbd key={k} className={styles.key}>
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
