import React from 'react';
import styles from './Player.module.css';
import { ProgressBar } from './ProgressBar.js';
import { VolumeControl } from './VolumeControl.js';
import { SpeedMenu } from './SpeedMenu.js';
import { QualityMenu, QualityTrack } from './QualityMenu.js';
import { formatTime, formatBytes } from '../../utils/format.js';

interface ControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  streamingSpeed?: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  isFullscreen: boolean;
  isPiP: boolean;
  isAdvancedDataOpen: boolean;
  qualityTracks: QualityTrack[];
  selectedQualityId: number | string | 'auto';
  isVisible: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onSelectRate: (rate: number) => void;
  onSelectQuality: (id: number | string | 'auto') => void;
  onToggleFullscreen: () => void;
  onTogglePiP: () => void;
  onToggleAdvancedData: () => void;
  onOpenShortcuts: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  isPlaying,
  currentTime,
  duration,
  bufferedEnd,
  streamingSpeed,
  volume,
  isMuted,
  playbackRate,
  isFullscreen,
  isPiP,
  isAdvancedDataOpen,
  qualityTracks,
  selectedQualityId,
  isVisible,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onSelectRate,
  onSelectQuality,
  onToggleFullscreen,
  onTogglePiP,
  onToggleAdvancedData,
  onOpenShortcuts,
}) => {
  return (
    <div className={`${styles.controlsOverlay} ${isVisible ? styles.controlsVisible : styles.controlsHidden}`}>
      {/* Top bar (shortcuts button & optional title) */}
      <div className={styles.controlsTop}>
        <div />
        <button
          type="button"
          className={`${styles.ctrlBtnSmall} ${styles.desktopOnly}`}
          onClick={onOpenShortcuts}
          title="Keyboard Shortcuts (?)"
          aria-label="Keyboard Shortcuts"
        >
          <span>?</span>
        </button>
      </div>

      {/* Center play / rewind / forward quick action overlay */}
      <div className={styles.controlsCenter}>
        <button
          type="button"
          className={`${styles.centerActionBtn} ${styles.centerSkipBtn}`}
          onClick={(e) => {
            e.stopPropagation();
            onSeek(Math.max(0, currentTime - 10));
          }}
          title="Rewind 10s"
          aria-label="Rewind 10 seconds"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>
          </svg>
          <span className={styles.centerSkipBadge}>10</span>
        </button>

        <button
          type="button"
          className={styles.centerPlayBtn}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlay();
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1"></rect>
              <rect x="14" y="4" width="4" height="16" rx="1"></rect>
            </svg>
          ) : (
            <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '4px' }}>
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          )}
        </button>

        <button
          type="button"
          className={`${styles.centerActionBtn} ${styles.centerSkipBtn}`}
          onClick={(e) => {
            e.stopPropagation();
            const maxT = isFinite(duration) && duration > 0 ? duration : Infinity;
            onSeek(Math.min(maxT, currentTime + 10));
          }}
          title="Forward 10s"
          aria-label="Forward 10 seconds"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>
          </svg>
          <span className={styles.centerSkipBadge}>10</span>
        </button>
      </div>

      {/* Bottom controls bar */}
      <div className={styles.controlsBottom}>
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          bufferedEnd={bufferedEnd}
          onSeek={onSeek}
        />

        <div className={styles.controlsRow}>
          {/* Left: Play/Pause, Rewind/FastForward, Volume, Time */}
          <div className={styles.controlsGroup}>
            <button
              type="button"
              className={styles.ctrlBtn}
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                  <rect x="14" y="4" width="4" height="16" rx="1"></rect>
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              )}
            </button>

            {/* Skip -10s */}
            <button
              type="button"
              className={styles.ctrlBtn}
              onClick={() => onSeek(Math.max(0, currentTime - 10))}
              title="Rewind 10s (Left Arrow)"
              aria-label="Rewind 10 seconds"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>
              </svg>
            </button>

            {/* Skip +10s */}
            <button
              type="button"
              className={styles.ctrlBtn}
              onClick={() => {
                const maxT = isFinite(duration) && duration > 0 ? duration : Infinity;
                onSeek(Math.min(maxT, currentTime + 10));
              }}
              title="Forward 10s (Right Arrow)"
              aria-label="Forward 10 seconds"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>
              </svg>
            </button>

            <VolumeControl
              volume={volume}
              isMuted={isMuted}
              onVolumeChange={onVolumeChange}
              onToggleMute={onToggleMute}
            />

            <div className={styles.timeDisplay}>
              <span>{formatTime(currentTime)}</span>
              <span className={styles.timeDivider}>/</span>
              <span>{formatTime(duration)}</span>
            </div>

            {streamingSpeed !== undefined && streamingSpeed > 0 && (
              <div
                className={styles.speedometerBadge}
                title={`Live stream transfer rate: ${formatBytes(streamingSpeed)}/s`}
              >
                <span className={styles.speedometerIcon}>⚡</span>
                <span>{formatBytes(streamingSpeed)}/s</span>
              </div>
            )}
          </div>

          {/* Right: Quality, Speed, PiP, Fullscreen */}
          <div className={styles.controlsGroup}>
            {qualityTracks.length > 0 && (
              <QualityMenu
                tracks={qualityTracks}
                selectedTrackId={selectedQualityId}
                onSelectTrack={onSelectQuality}
              />
            )}

            <SpeedMenu
              currentRate={playbackRate}
              onSelectRate={onSelectRate}
            />

            {/* Advanced Stream Data Button */}
            <button
              type="button"
              className={`${styles.ctrlBtn} ${isAdvancedDataOpen ? styles.ctrlBtnActive : ''}`}
              onClick={onToggleAdvancedData}
              aria-label="Stream Stats & Buffer Telemetry (D)"
              title="Stream Stats & Buffer Telemetry (D)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M18 17V9" />
                <path d="M13 17V5" />
                <path d="M8 17v-3" />
              </svg>
            </button>

            {document.pictureInPictureEnabled && (
              <button
                type="button"
                className={styles.ctrlBtn}
                onClick={onTogglePiP}
                aria-label={isPiP ? 'Exit Picture-in-Picture' : 'Picture-in-Picture (P)'}
                title={isPiP ? 'Exit Picture-in-Picture' : 'Picture-in-Picture (P)'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                  <rect x="12" y="10" width="8" height="8" rx="1" fill="currentColor"></rect>
                </svg>
              </button>
            )}

            <button
              type="button"
              className={styles.ctrlBtn}
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isFullscreen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
