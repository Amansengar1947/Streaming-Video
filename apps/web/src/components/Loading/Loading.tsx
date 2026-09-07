import React from 'react';
import styles from './Loading.module.css';

interface LoadingProps {
  message?: string;
}

export const Loading: React.FC<LoadingProps> = ({ message = 'Analyzing URL and probing media streams...' }) => {
  return (
    <div className={styles.container} role="status" aria-live="polite">
      <div className={styles.spinner} />
      <div className={styles.title}>{message}</div>
      <div className={styles.steps}>
        <span className={styles.stepDot} />
        <span>Validating security, resolving DNS, detecting formats</span>
      </div>
    </div>
  );
};
