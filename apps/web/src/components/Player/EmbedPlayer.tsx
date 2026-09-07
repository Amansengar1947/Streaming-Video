import React, { useMemo } from 'react';
import styles from './Player.module.css';

interface EmbedPlayerProps {
  embedHtml: string;
  title?: string;
}

export const EmbedPlayer: React.FC<EmbedPlayerProps> = ({ embedHtml, title = 'Embedded Media' }) => {
  const safeIframeSrc = useMemo(() => {
    if (!embedHtml) return null;
    const match = /<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(embedHtml);
    if (match && match[1]) {
      try {
        const parsed = new URL(match[1]);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          return parsed.toString();
        }
      } catch {
        return null;
      }
    }
    return null;
  }, [embedHtml]);

  if (!safeIframeSrc) {
    return (
      <div className={styles.embedContainer}>
        <div className={styles.emptyState}>
          Unable to display embed: media provider did not supply a valid secure player.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.embedContainer}>
      <div className={styles.embedWrapper} title={title}>
        <iframe
          src={safeIframeSrc}
          title={title}
          width="100%"
          height="100%"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          sandbox="allow-scripts allow-presentation allow-same-origin allow-popups"
        />
      </div>
    </div>
  );
};
