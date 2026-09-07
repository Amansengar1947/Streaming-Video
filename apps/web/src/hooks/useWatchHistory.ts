import { useState, useCallback, useRef } from 'react';
import type { ResolvedMedia, WatchHistoryItem, StreamType } from '@video-player/shared';

const STORAGE_KEY = 'mediadeck_watch_history';
const MAX_HISTORY_ITEMS = 50;

/**
 * Derives a clean, human-friendly title from a URL or filename
 */
export function extractTitleFromUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const pathname = decodeURIComponent(url.pathname);
    const filename = pathname.split('/').filter(Boolean).pop() || '';
    if (filename && filename.includes('.')) {
      // Remove common file extension and clean separators
      const name = filename.replace(/\.[a-zA-Z0-9]+$/, '').replace(/[_.-]+/g, ' ');
      if (name.trim().length > 0) return name.trim();
    }
    return url.hostname + (pathname.length > 1 ? pathname : '');
  } catch {
    return rawUrl.slice(0, 40);
  }
}

/**
 * Normalizes URL for consistent history identification
 */
export function normalizeHistoryId(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.origin}${u.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function useWatchHistory() {
  const [history, setHistory] = useState<WatchHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: WatchHistoryItem[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.sort((a, b) => b.lastWatched - a.lastWatched);
        }
      }
    } catch (e) {
      console.warn('Failed to read watch history from localStorage:', e);
    }
    return [];
  });

  const historyRef = useRef<WatchHistoryItem[]>(history);
  historyRef.current = history;

  const persistHistory = useCallback((items: WatchHistoryItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Failed to save watch history to localStorage:', e);
    }
  }, []);

  /**
   * Adds or updates a media item in the history
   */
  const saveItem = useCallback((media: ResolvedMedia, currentTime = 0, duration = 0) => {
    if (!media || !media.originalUrl) return;

    const id = normalizeHistoryId(media.originalUrl);
    const primaryStream = media.streams?.[0];
    const title = media.title?.trim() || extractTitleFromUrl(media.originalUrl);
    const streamType: StreamType = primaryStream?.type || 'mp4';
    const streamUrl = primaryStream?.url || '';
    const now = Date.now();

    setHistory((prev) => {
      const existingIdx = prev.findIndex((item) => item.id === id || normalizeHistoryId(item.originalUrl) === id);
      const existing = existingIdx !== -1 ? prev[existingIdx] : null;

      const effectiveDuration = duration > 0 
        ? duration 
        : (media.duration && media.duration > 0 
            ? media.duration 
            : (existing?.duration || 0));

      const effectiveTime = currentTime > 0 
        ? currentTime 
        : (existing?.currentTime || 0);

      const newItem: WatchHistoryItem = {
        id,
        title,
        originalUrl: media.originalUrl,
        directStreamUrl: streamUrl,
        streamType,
        thumbnail: media.thumbnail || existing?.thumbnail,
        duration: effectiveDuration,
        currentTime: effectiveTime,
        lastWatched: now,
        resolvedMedia: media,
      };

      let next: WatchHistoryItem[];
      if (existingIdx !== -1) {
        next = [...prev];
        next[existingIdx] = newItem;
      } else {
        next = [newItem, ...prev];
      }

      next.sort((a, b) => b.lastWatched - a.lastWatched);
      const trimmed = next.slice(0, MAX_HISTORY_ITEMS);
      persistHistory(trimmed);
      return trimmed;
    });
  }, [persistHistory]);

  /**
   * Throttled playback progress update
   */
  const lastProgressUpdateRef = useRef<number>(0);
  const updateProgress = useCallback((originalUrl: string, currentTime: number, duration = 0) => {
    if (!originalUrl || currentTime < 0) return;

    const now = performance.now();
    // Throttle progress writes to at most once per 2 seconds
    if (now - lastProgressUpdateRef.current < 2000) {
      return;
    }
    lastProgressUpdateRef.current = now;

    const id = normalizeHistoryId(originalUrl);

    setHistory((prev) => {
      const idx = prev.findIndex((item) => item.id === id || normalizeHistoryId(item.originalUrl) === id);
      if (idx === -1) return prev;

      const item = prev[idx];
      const effDur = duration > 0 ? duration : item.duration;

      // Don't overwrite if progress hasn't meaningfully changed
      if (Math.abs(item.currentTime - currentTime) < 0.5 && item.duration === effDur) {
        return prev;
      }

      const updatedItem: WatchHistoryItem = {
        ...item,
        currentTime,
        duration: effDur,
        lastWatched: Date.now(),
      };

      const next = [...prev];
      next[idx] = updatedItem;
      persistHistory(next);
      return next;
    });
  }, [persistHistory]);

  /**
   * Updates an existing history item with freshly resolved media (e.g. after stream URL expiration)
   */
  const updateItemStream = useCallback((idOrUrl: string, freshMedia: ResolvedMedia) => {
    const targetId = normalizeHistoryId(idOrUrl);
    const primaryStream = freshMedia.streams?.[0];

    setHistory((prev) => {
      const idx = prev.findIndex((item) => item.id === targetId || normalizeHistoryId(item.originalUrl) === targetId);
      if (idx === -1) return prev;

      const current = prev[idx];
      const updated: WatchHistoryItem = {
        ...current,
        title: freshMedia.title || current.title,
        thumbnail: freshMedia.thumbnail || current.thumbnail,
        directStreamUrl: primaryStream?.url || current.directStreamUrl,
        streamType: primaryStream?.type || current.streamType,
        duration: (freshMedia.duration && freshMedia.duration > 0) ? freshMedia.duration : current.duration,
        resolvedMedia: freshMedia,
        lastWatched: Date.now(),
      };

      const next = [...prev];
      next[idx] = updated;
      persistHistory(next);
      return next;
    });
  }, [persistHistory]);

  /**
   * Removes an individual item from history
   */
  const removeItem = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      persistHistory(next);
      return next;
    });
  }, [persistHistory]);

  /**
   * Clears all history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  /**
   * Gets an item by URL
   */
  const getItem = useCallback((url: string): WatchHistoryItem | undefined => {
    const id = normalizeHistoryId(url);
    return historyRef.current.find((item) => item.id === id || normalizeHistoryId(item.originalUrl) === id);
  }, []);

  return {
    history,
    saveItem,
    updateProgress,
    updateItemStream,
    removeItem,
    clearHistory,
    getItem,
  };
}
