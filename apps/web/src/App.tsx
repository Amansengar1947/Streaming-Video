import React, { useState, useEffect, useCallback } from 'react';
import type { ResolvedMedia, SniffedMediaItem } from '@video-player/shared';
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

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  const [currentUrl, setCurrentUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resolvedMedia, setResolvedMedia] = useState<ResolvedMedia | null>(null);
  const [error, setError] = useState<{ code?: string; message: string; detail?: string } | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

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

  const handleLoadUrl = async (urlToLoad: string) => {
    if (!urlToLoad.trim()) return;

    setCurrentUrl(urlToLoad);
    setIsLoading(true);
    setError(null);

    // Update browser URL query without reload
    const newSearch = new URLSearchParams(window.location.search);
    newSearch.set('url', urlToLoad);
    window.history.replaceState(null, '', `${window.location.pathname}?${newSearch.toString()}`);

    try {
      const result = await resolveUrl(urlToLoad);
      setResolvedMedia(result);
      setBackendOnline(true);
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
                    ? 'Backend API server is running at http://127.0.0.1:3001'
                    : 'Backend API is offline. Start the backend with "pnpm dev" or "pnpm dev:server".'
                }
              >
                <span className={styles.statusDot} />
                <span>{backendOnline ? 'Backend Online' : 'Backend Offline'}</span>
              </span>
            )}

            {/* 1DM Browser Sniffer Launcher Button */}
            <button
              type="button"
              className={styles.helpBtn}
              onClick={() => handleOpenBrowser()}
              title="Open In-App Browser to navigate pages and capture video streams (1DM mode)"
              style={{ color: 'var(--accent)', fontWeight: 600, borderColor: 'var(--accent)' }}
            >
              <span>🌐 Browser Sniffer</span>
            </button>

            <button
              type="button"
              className={styles.helpBtn}
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

        {/* Loading Indicator */}
        {isLoading && <Loading message="Resolving media stream and headers..." />}

        {/* Error State */}
        {error && (
          <ErrorDisplay
            code={error.code}
            message={error.message}
            detail={error.detail}
            onRetry={() => handleLoadUrl(currentUrl)}
            onDismiss={() => setError(null)}
            onOpenBrowser={() => handleOpenBrowser(currentUrl)}
          />
        )}

        {/* Player & Info Section */}
        {resolvedMedia && !isLoading && (
          <section className={styles.playerSection}>
            <Player
              media={resolvedMedia}
              onOpenShortcuts={() => setIsShortcutsOpen(true)}
              onError={handlePlayerError}
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
    </div>
  );
};
