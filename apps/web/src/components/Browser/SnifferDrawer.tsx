import React, { useState } from 'react';
import type { SniffedMediaItem } from '@video-player/shared';
import styles from './BrowserModal.module.css';

interface SnifferDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  streams: SniffedMediaItem[];
  onPlayStream: (stream: SniffedMediaItem) => void;
  onClearStreams: () => void;
}

export const SnifferDrawer: React.FC<SnifferDrawerProps> = ({
  isOpen,
  onClose,
  streams,
  onPlayStream,
  onClearStreams,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className={styles.drawer}>
      <div className={styles.drawerHeader}>
        <div className={styles.drawerTitle}>
          <span>🎬 Captured Streams</span>
          <span className={styles.typeBadge}>{streams.length}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {streams.length > 0 && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={onClearStreams}
              title="Clear captured stream list"
            >
              Clear All
            </button>
          )}
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            title="Close drawer"
          >
            ✕
          </button>
        </div>
      </div>

      <div className={styles.streamList}>
        {streams.length === 0 ? (
          <div className={styles.emptyStreamState}>
            <svg className={styles.emptyStreamIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
              <line x1="7" y1="2" x2="7" y2="22"></line>
              <line x1="17" y1="2" x2="17" y2="22"></line>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <line x1="2" y1="7" x2="7" y2="7"></line>
              <line x1="2" y1="17" x2="7" y2="17"></line>
              <line x1="17" y1="17" x2="22" y2="17"></line>
              <line x1="17" y1="7" x2="22" y2="7"></line>
            </svg>
            <p><strong>No media streams captured yet.</strong></p>
            <p style={{ fontSize: '0.8rem' }}>
              Navigate to the video or download page and click Play or Download. The 1DM sniffer will capture the stream automatically!
            </p>
          </div>
        ) : (
          streams.map((stream) => (
            <div key={stream.id} className={styles.streamCard}>
              <div className={styles.cardHeader}>
                <span className={styles.typeBadge}>{stream.type.toUpperCase()}</span>
                <span className={styles.cardTitle} title={stream.title}>
                  {stream.title}
                </span>
              </div>

              <div className={styles.cardUrl} title={stream.url}>
                {stream.url}
              </div>

              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.playBtn}
                  onClick={() => onPlayStream(stream)}
                  title="Play this stream directly in MediaDeck player"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  <span>Play in MediaDeck</span>
                </button>

                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => handleCopy(stream.id, stream.url)}
                  title="Copy direct stream link to clipboard"
                >
                  {copiedId === stream.id ? (
                    <span style={{ color: '#10b981', fontWeight: 700 }}>✓ Copied!</span>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
