import React from 'react';
import type { ResolvedMedia, StreamInfo } from '@video-player/shared';
import styles from './MediaInfo.module.css';

interface MediaInfoProps {
  media: ResolvedMedia;
  activeStream?: StreamInfo;
}

export const MediaInfo: React.FC<MediaInfoProps> = ({ media, activeStream }) => {
  const typeBadge =
    media.kind === 'embed'
      ? 'EMBED'
      : (activeStream?.type || media.streams?.[0]?.type || 'VIDEO').toUpperCase();

  let hostname = '';
  try {
    hostname = new URL(media.originalUrl).hostname;
  } catch {
    hostname = media.provider || '';
  }

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        {media.thumbnail && (
          <img src={media.thumbnail} alt="" className={styles.thumbnail} />
        )}

        <div className={styles.meta}>
          <h2 className={styles.title} title={media.title || 'Untitled Video'}>
            {media.title || 'Untitled Video'}
          </h2>

          <div className={styles.badges}>
            <span className={`${styles.badge} ${styles.badgeType}`}>{typeBadge}</span>
            {media.provider && (
              <span className={`${styles.badge} ${styles.badgeProvider}`}>{media.provider}</span>
            )}
            {activeStream?.quality && (
              <span className={`${styles.badge} ${styles.badgeResolution}`}>{activeStream.quality}</span>
            )}
            {hostname && !media.provider && (
              <span className={`${styles.badge} ${styles.badgeProvider}`}>{hostname}</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.right}>
        <a
          href={media.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.sourceLink}
          title="Open original page in new tab"
        >
          <span>Open Source</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      </div>
    </div>
  );
};
