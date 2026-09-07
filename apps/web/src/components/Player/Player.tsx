import React, { useState } from 'react';
import type { ResolvedMedia } from '@video-player/shared';
import styles from './Player.module.css';
import { VideoPlayer } from './VideoPlayer.js';
import { EmbedPlayer } from './EmbedPlayer.js';

interface PlayerProps {
  media: ResolvedMedia;
  onOpenShortcuts: () => void;
  onError: (error: string) => void;
}

export const Player: React.FC<PlayerProps> = ({ media, onOpenShortcuts, onError }) => {
  const streams = media.streams || [];

  const initialIndex = React.useMemo(() => {
    if (!streams.length) return 0;
    const remuxIdx = streams.findIndex(s => s.url.includes('/api/stream/remux') || (s.proxyUrl && s.proxyUrl.includes('/api/stream/remux')));
    if (remuxIdx !== -1) return remuxIdx;
    const mp4Idx = streams.findIndex(s => s.type === 'mp4');
    if (mp4Idx !== -1) return mp4Idx;
    return 0;
  }, [streams]);

  const [activeStreamIndex, setActiveStreamIndex] = useState(initialIndex);

  React.useEffect(() => {
    setActiveStreamIndex(initialIndex);
  }, [initialIndex]);

  const currentStream = streams[activeStreamIndex] || streams[0];

  return (
    <div className={styles.wrapper}>
      {/* Stream format switcher if multiple distinct streams were detected */}
      {streams.length > 1 && (
        <div className={styles.streamSwitcher}>
          <span className={styles.switcherLabel}>Available Streams:</span>
          {streams.map((s, idx) => (
            <button
              key={`${s.url}-${idx}`}
              type="button"
              className={`${styles.streamChip} ${idx === activeStreamIndex ? styles.streamChipActive : ''}`}
              onClick={() => setActiveStreamIndex(idx)}
            >
              {s.label || s.quality || `${s.type.toUpperCase()} #${idx + 1}`}
            </button>
          ))}
        </div>
      )}

      {media.kind === 'player' && currentStream ? (
        <VideoPlayer
          stream={currentStream}
          mediaDuration={media.duration}
          poster={media.thumbnail}
          onOpenShortcuts={onOpenShortcuts}
          onError={onError}
        />
      ) : media.kind === 'embed' && media.embedHtml ? (
        <EmbedPlayer embedHtml={media.embedHtml} title={media.title} />
      ) : (
        <div className={styles.emptyState}>
          <p>No playable media stream available.</p>
        </div>
      )}
    </div>
  );
};
