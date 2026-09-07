import React from 'react';
import styles from './Player.module.css';

interface EmbedPlayerProps {
  embedHtml: string;
  title?: string;
}

export const EmbedPlayer: React.FC<EmbedPlayerProps> = ({ embedHtml, title = 'Embedded Media' }) => {
  return (
    <div className={styles.embedContainer}>
      <div
        className={styles.embedWrapper}
        dangerouslySetInnerHTML={{ __html: embedHtml }}
        title={title}
      />
    </div>
  );
};
