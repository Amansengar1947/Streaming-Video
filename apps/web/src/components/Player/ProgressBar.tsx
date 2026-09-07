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
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState(0);

  const calculateTimeFromClientX = useCallback(
    (clientX: number): number => {
      if (!barRef.current || !isFinite(duration) || duration <= 0) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const percentage = rect.width > 0 ? clickX / rect.width : 0;
      return percentage * duration;
    },
    [duration]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isFinite(duration) || duration <= 0) return;
    setIsDragging(true);
    const time = calculateTimeFromClientX(e.clientX);
    setDragTime(time);
    setHoverTime(time);
    if (barRef.current) {
      const rect = barRef.current.getBoundingClientRect();
      setHoverPosition(Math.max(0, Math.min(e.clientX - rect.left, rect.width)));
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const moveTime = calculateTimeFromClientX(moveEvent.clientX);
      setDragTime(moveTime);
      setHoverTime(moveTime);
      if (barRef.current) {
        const rect = barRef.current.getBoundingClientRect();
        setHoverPosition(Math.max(0, Math.min(moveEvent.clientX - rect.left, rect.width)));
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsDragging(false);
      setHoverTime(null);
      setDragTime(null);
      const finalTime = calculateTimeFromClientX(upEvent.clientX);
      onSeek(finalTime);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!barRef.current || !isFinite(duration) || duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHoverPosition(x);
    setHoverTime((x / rect.width) * duration);
  };

  const handleMouseLeave = () => {
    if (!isDragging) {
      setHoverTime(null);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length !== 1 || !isFinite(duration) || duration <= 0) return;
    setIsDragging(true);
    const clientX = e.touches[0].clientX;
    const time = calculateTimeFromClientX(clientX);
    setDragTime(time);
    setHoverTime(time);
    if (barRef.current) {
      const rect = barRef.current.getBoundingClientRect();
      setHoverPosition(Math.max(0, Math.min(clientX - rect.left, rect.width)));
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!isDragging || e.touches.length !== 1 || !isFinite(duration) || duration <= 0) return;
    const clientX = e.touches[0].clientX;
    const time = calculateTimeFromClientX(clientX);
    setDragTime(time);
    setHoverTime(time);
    if (barRef.current) {
      const rect = barRef.current.getBoundingClientRect();
      setHoverPosition(Math.max(0, Math.min(clientX - rect.left, rect.width)));
    }
  };

  const handleTouchEnd = (e?: React.TouchEvent) => {
    if (e) e.stopPropagation();
    if (isDragging && dragTime !== null) {
      onSeek(dragTime);
    }
    setIsDragging(false);
    setDragTime(null);
    setHoverTime(null);
  };

  const effectiveTime = dragTime !== null ? dragTime : currentTime;
  const progressPercent = duration > 0 && isFinite(duration) ? Math.min(100, (effectiveTime / duration) * 100) : 0;
  const bufferedPercent = duration > 0 && isFinite(duration) ? Math.min(100, (bufferedEnd / duration) * 100) : 0;

  return (
    <div
      className={styles.progressContainer}
      ref={barRef}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
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

      {/* Hover/drag time tooltip */}
      {hoverTime !== null && isFinite(duration) && duration > 0 && (
        <div className={styles.hoverTooltip} style={{ left: `${hoverPosition}px` }}>
          {formatTime(hoverTime)}
        </div>
      )}
    </div>
  );
};
