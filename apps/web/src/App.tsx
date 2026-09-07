import React, { useState, useEffect, useCallback } from 'react';
import type { ResolvedMedia, SniffedMediaItem, WatchHistoryItem } from '@video-player/shared';
import styles from './App.module.css';
import { useTheme } from './hooks/useTheme.js';
import { resolveUrl, checkHealth } from './api/client.js';
import { URLInput } from './components/URLInput/URLInput.js';
import { Loading } from './components/Loading/Loading.js';
import { ErrorDisplay } from './components/ErrorDisplay/ErrorDisplay.js';
import { Player } from './components/Player/Player.js';
import { MediaInfo } from './components/MediaInfo/MediaInfo.js';
import { ThemeToggle } from './components/ThemeToggle/ThemeToggle.js';
import { ShortcutsModal } from './components/ShortcutsModal/ShortcutsModal.js';
import { BrowserModal } from './components/Browser/BrowserModal.js';
import { useWatchHistory } from './hooks/useWatchHistory.js';
import { HistoryDrawer } from './components/History/HistoryDrawer.js';
import { ContinueWatching } from './components/History/ContinueWatching.js';

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  const [currentUrl, setCurrentUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resolvedMedia, setResolvedMedia] = useState<ResolvedMedia | null>(null);
  const [error, setError] = useState<{ code?: string; message: string; detail?: string } | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  // Watch History & Resume state
  const {
    history,
    saveItem,
    updateProgress,
    updateItemStream,
    removeItem,
    clearHistory,
    getItem,
  } = useWatchHistory();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [initialSeekTime, setInitialSeekTime] = useState<number>(0);

  // In-app Browser & 1DM Sniffer state
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [browserTargetUrl, setBrowserTargetUrl] = useState('');

  // Poll backend health to provide instant visual feedback on connection state
  const verifyBackendHealth = useCallback(async () => {
    try {
      await checkHealth();
      setBackendOnline(true);
    } catch {
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    verifyBackendHealth();
    const interval = setInterval(verifyBackendHealth, 15000);
    return () => clearInterval(interval);
  }, [verifyBackendHealth]);

  // Check URL query param on initial load (e.g. ?url=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryUrl = params.get('url');
    if (queryUrl) {
      handleLoadUrl(queryUrl);
    }
  }, []);

  const handleLoadUrl = async (urlToLoad: string, resumeAtTime?: number) => {
    if (!urlToLoad.trim()) return;

    setCurrentUrl(urlToLoad);
    setIsLoading(true);
    setError(null);

    // Look up existing history for resume position if not explicitly provided
    const existing = getItem(urlToLoad);
    const resumeTime = typeof resumeAtTime === 'number'
      ? resumeAtTime
      : (existing && existing.currentTime > 3 ? existing.currentTime : 0);
    setInitialSeekTime(resumeTime);

    // Update browser URL query without reload
    const newSearch = new URLSearchParams(window.location.search);
    newSearch.set('url', urlToLoad);
    window.history.replaceState(null, '', `${window.location.pathname}?${newSearch.toString()}`);

    try {
      const result = await resolveUrl(urlToLoad);
      setResolvedMedia(result);
      setBackendOnline(true);
      // Save / update in history
      saveItem(result, resumeTime, result.duration || 0);
    } catch (err: any) {
      setError({
        code: err.code || 'RESOLUTION_FAILED',
        message: err.message || 'Failed to analyze and load this media URL.',
        detail: err.detail,
      });
      setResolvedMedia(null);
      if (err.code === 'NETWORK_ERROR') {
        setBackendOnline(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayerError = useCallback((errorMsg: string) => {
    setError({
      code: 'PLAYBACK_ERROR',
      message: errorMsg,
      detail: 'If this streaming link has an expiration time (e.g. pre-signed Cloudflare R2 / S3 URL), click "Refresh Link from Source" below to obtain a fresh link and resume.',
    });
  }, []);

  const handleOpenBrowser = (urlToBrowse?: string) => {
    setBrowserTargetUrl(urlToBrowse || currentUrl || 'https://archive.org/details/movies');
    setIsBrowserOpen(true);
  };

  const handlePlaySniffedStream = async (item: SniffedMediaItem) => {
    setIsBrowserOpen(false);
    setError(null);
    setCurrentUrl(item.url);
    setIsLoading(true);

    try {
      const backendResolved = await resolveUrl(item.url);
      setResolvedMedia(backendResolved);
      saveItem(backendResolved, 0, backendResolved.duration || 0);
    } catch (err: any) {
      // If backend resolve fails, fallback to optimistic stream
      const isMkv = item.url.toLowerCase().includes('.mkv') || item.type === 'mkv' || (item.mimeType?.includes('matroska') ?? false);
      const initialMedia: ResolvedMedia = {
        kind: 'player',
        title: item.title,
        originalUrl: item.url,
        streams: [
          {
            url: item.url,
            type: isMkv ? 'mkv' : (item.type || 'mp4'),
            mimeType: isMkv ? 'video/x-matroska' : item.mimeType,
            label: `${(item.type || 'mp4').toUpperCase()} (1DM Sniffed)`,
            requiresProxy: true,
            size: item.fileSize,
          },
        ],
      };
      setResolvedMedia(initialMedia);
      saveItem(initialMedia, 0, 0);
    } finally {
      setIsLoading(false);
    }
  };

  // Play an item selected from History
  const handlePlayHistoryItem = (item: WatchHistoryItem) => {
    const resumeTime = item.currentTime > 3 ? item.currentTime : 0;
    setInitialSeekTime(resumeTime);
    setCurrentUrl(item.originalUrl);
    setError(null);

    // Update browser URL query
    const newSearch = new URLSearchParams(window.location.search);
    newSearch.set('url', item.originalUrl);
    window.history.replaceState(null, '', `${window.location.pathname}?${newSearch.toString()}`);

    if (item.resolvedMedia && item.resolvedMedia.streams && item.resolvedMedia.streams.length > 0) {
      setResolvedMedia(item.resolvedMedia);
      saveItem(item.resolvedMedia, resumeTime, item.duration);
    } else {
      handleLoadUrl(item.originalUrl, resumeTime);
    }
  };

  // Refresh expired link from original source
  const handleRefreshHistoryItem = async (item: WatchHistoryItem) => {
    try {
      const refreshed = await resolveUrl(item.originalUrl);
      updateItemStream(item.id, refreshed);
      if (currentUrl === item.originalUrl || !resolvedMedia) {
        setInitialSeekTime(item.currentTime || 0);
        setCurrentUrl(item.originalUrl);
        setResolvedMedia(refreshed);
        setError(null);
      }
    } catch (err: any) {
      setError({
        code: 'REFRESH_FAILED',
        message: `Failed to refresh stream link from ${item.originalUrl}: ${err.message || 'Source unreachable'}`,
        detail: err.detail,
      });
    }
  };

  // Refresh current active stream from original source (e.g. from error screen)
  const handleRefreshCurrentSource = async () => {
    if (!currentUrl) return;
    setIsLoading(true);
    setError(null);
    try {
      const refreshed = await resolveUrl(currentUrl);
      updateItemStream(currentUrl, refreshed);
      setResolvedMedia(refreshed);
    } catch (err: any) {
      setError({
        code: 'REFRESH_FAILED',
        message: `Failed to refresh link from original source: ${err.message || 'Source unreachable'}`,
        detail: err.detail,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.appContainer}>
      {/* Top Navigation Bar */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.brand}>
            <div className={styles.logoIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </div>
            <div className={styles.brandText}>
              <span className={styles.brandName}>MediaDeck</span>
              <span className={styles.brandTagline}>Personal Video Player</span>
            </div>
          </div>

          <div className={styles.headerActions}>
            {/* Backend connection status pill */}
            {backendOnline !== null && (
              <span
                className={`${styles.statusPill} ${backendOnline ? styles.statusOnline : styles.statusOffline}`}
                title={
                  backendOnline
                    ? 'Backend API server is online'
                    : 'Backend API is offline'
                }
              >
                <span className={styles.statusDot} />
                <span className={styles.statusText}>{backendOnline ? 'Online' : 'Offline'}</span>
              </span>
            )}

            {/* Watch History Launcher Button */}
            <button
              type="button"
              className={`${styles.helpBtn} ${styles.historyBtn}`}
              onClick={() => setIsHistoryOpen(true)}
              title="View your saved videos and watch history"
            >
              <span>🕒</span>
              <span className={styles.historyBtnText}>History</span>
              {history.length > 0 && (
                <span className={styles.historyBadge}>{history.length}</span>
              )}
            </button>

            {/* 1DM Browser Sniffer Launcher Button */}
            <button
              type="button"
              className={`${styles.helpBtn} ${styles.snifferBtn}`}
              onClick={() => handleOpenBrowser()}
              title="Open In-App Browser to navigate pages and capture video streams (1DM mode)"
            >
              <span>🌐</span>
              <span className={styles.snifferBtnText}>Sniffer</span>
            </button>

            <button
              type="button"
              className={`${styles.helpBtn} ${styles.desktopOnly}`}
              onClick={() => setIsShortcutsOpen(true)}
              title="Keyboard Shortcuts (?)"
            >
              <span>Shortcuts</span>
              <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', opacity: 0.7 }}>?</kbd>
            </button>

            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className={styles.main}>
        {/* Offline Warning Banner if backend is not running */}
        {backendOnline === false && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.9rem',
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <strong>Backend Server Offline:</strong> Port 3001 is not responding. Please start the backend in terminal with: <code>pnpm dev</code> or <code>pnpm dev:server</code>.
            </div>
            <button
              type="button"
              onClick={verifyBackendHealth}
              style={{
                padding: '4px 10px',
                backgroundColor: 'var(--error)',
                color: '#fff',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* URL Input Form */}
        <URLInput
          onLoadUrl={handleLoadUrl}
          isLoading={isLoading}
          initialUrl={currentUrl}
        />

        {/* Continue Watching Carousel (when history exists and not currently playing) */}
        {history.length > 0 && !resolvedMedia && !isLoading && (
          <ContinueWatching
            items={history}
            onPlay={handlePlayHistoryItem}
            onRefresh={handleRefreshHistoryItem}
            onRemove={removeItem}
            onOpenDrawer={() => setIsHistoryOpen(true)}
          />
        )}

        {/* Loading Indicator */}
        {isLoading && <Loading message="Resolving media stream and headers..." />}

        {/* Error State */}
        {error && (
          <ErrorDisplay
            code={error.code}
            message={error.message}
            detail={error.detail}
            onRetry={() => handleLoadUrl(currentUrl)}
            onRefreshSource={currentUrl ? handleRefreshCurrentSource : undefined}
            onDismiss={() => setError(null)}
            onOpenBrowser={() => handleOpenBrowser(currentUrl)}
          />
        )}

        {/* Player & Info Section */}
        {resolvedMedia && !isLoading && (
          <section className={styles.playerSection}>
            <Player
              media={resolvedMedia}
              initialTime={initialSeekTime}
              onTimeUpdate={(time, dur) => updateProgress(currentUrl, time, dur)}
              onOpenShortcuts={() => setIsShortcutsOpen(true)}
              onError={handlePlayerError}
              onRefreshSource={handleRefreshCurrentSource}
            />

            <MediaInfo
              media={resolvedMedia}
              activeStream={resolvedMedia.streams?.[0]}
            />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>MediaDeck • Private Personal Video Player • Supports MP4, HLS, DASH, WebM, and Embeds</p>
      </footer>

      {/* Shortcuts Help Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* In-App Browser with 1DM-Style Media Sniffer & Ad Blocker */}
      <BrowserModal
        isOpen={isBrowserOpen}
        initialUrl={browserTargetUrl}
        onClose={() => setIsBrowserOpen(false)}
        onPlayStream={handlePlaySniffedStream}
      />

      {/* Watch History Drawer Modal */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        items={history}
        onPlay={handlePlayHistoryItem}
        onRefresh={handleRefreshHistoryItem}
        onRemove={removeItem}
        onClearAll={clearHistory}
      />
    </div>
  );
};
