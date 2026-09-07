import React, { useRef, useState, useCallback } from 'react';
import styles from './Player.module.css';
import { formatTime } from '../../utils/format.js';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  onSeek: (time: number) => void;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentTime,
  duration,
  bufferedEnd,
  onSeek,
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState(0);

  const calculateTimeFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent): number => {
      if (!barRef.current || duration <= 0) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percentage = clickX / rect.width;
      return percentage * duration;
    },
    [duration]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const newTime = calculateTimeFromEvent(e);
    onSeek(newTime);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const time = calculateTimeFromEvent(moveEvent);
      onSeek(time);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!barRef.current || duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHoverPosition(x);
    setHoverTime((x / rect.width) * duration);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      className={styles.progressContainer}
      ref={barRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      role="slider"
      aria-label="Video seek bar"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={currentTime}
      tabIndex={0}
    >
      <div className={styles.progressTrack}>
        {/* Buffered portion */}
        <div
          className={styles.progressBuffered}
          style={{ width: `${Math.min(bufferedPercent, 100)}%` }}
        />
        {/* Played portion */}
        <div
          className={styles.progressPlayed}
          style={{ width: `${Math.min(progressPercent, 100)}%` }}
        >
          <div className={`${styles.progressThumb} ${isDragging ? styles.progressThumbActive : ''}`} />
        </div>
      </div>

      {/* Hover time tooltip */}
      {hoverTime !== null && duration > 0 && (
        <div className={styles.hoverTooltip} style={{ left: `${hoverPosition}px` }}>
          {formatTime(hoverTime)}
        </div>
      )}
    </div>
  );
};
