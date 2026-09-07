import React, { useState, useEffect, useRef } from 'react';
import type { SniffedMediaItem } from '@video-player/shared';
import styles from './BrowserModal.module.css';
import { SnifferDrawer } from './SnifferDrawer.js';

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  isLoading: boolean;
}

interface BrowserModalProps {
  isOpen: boolean;
  initialUrl?: string;
  onClose: () => void;
  onPlayStream: (stream: SniffedMediaItem) => void;
}

export const BrowserModal: React.FC<BrowserModalProps> = ({
  isOpen,
  initialUrl = 'https://archive.org/details/movies',
  onClose,
  onPlayStream,
}) => {
  const [tabs, setTabs] = useState<BrowserTab[]>([
    {
      id: 'tab-1',
      title: 'Home',
      url: initialUrl,
      isLoading: true,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');
  const [addressBarUrl, setAddressBarUrl] = useState<string>(initialUrl);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sniffedStreams, setSniffedStreams] = useState<SniffedMediaItem[]>([]);
  const [blockedAdsCount, setBlockedAdsCount] = useState(0);
  const [downloadToast, setDownloadToast] = useState<{
    id: string;
    url: string;
    title: string;
    type: string;
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Ad Blocker is ON by default
  const [adBlockEnabled, setAdBlockEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('mediadeck_adblock_enabled');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());

  // Current active tab object
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Sync address bar with active tab URL when active tab changes
  useEffect(() => {
    if (activeTab) {
      setAddressBarUrl(activeTab.url);
    }
  }, [activeTabId]);

  // Sync initial URL if modal opens with new initialUrl
  useEffect(() => {
    if (initialUrl && isOpen) {
      setTabs((prev) => {
        if (prev.length === 1 && prev[0].title === 'Home') {
          return [
            {
              id: prev[0].id,
              title: 'Home',
              url: initialUrl,
              isLoading: true,
            },
          ];
        }
        return prev;
      });
      setAddressBarUrl(initialUrl);
    }
  }, [initialUrl, isOpen]);

  // Listen to sniffer, adblock, and OPEN_TAB postMessage events from any proxied iframe
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // 1. Real-time media captured by 1DM sniffer agent
      if (data.type === 'MEDIADECK_SNIFFED_MEDIA' && data.payload) {
        const item: SniffedMediaItem = data.payload;
        setSniffedStreams((prev) => {
          if (prev.some((s) => s.url === item.url)) {
            return prev;
          }
          return [item, ...prev];
        });
      }

      // 2. Ad popup or redirect blocked by sniffer agent
      if (data.type === 'MEDIADECK_BLOCKED_AD') {
        setBlockedAdsCount((count) => count + 1);
      }

      // 3. Website or user requested to open in a NEW TAB
      if (data.type === 'MEDIADECK_OPEN_TAB' && data.url) {
        const newTabUrl = data.url;
        let tabTitle = data.title || 'New Tab';
        try {
          tabTitle = new URL(newTabUrl).hostname || tabTitle;
        } catch {}

        const newId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const newTab: BrowserTab = {
          id: newId,
          title: tabTitle,
          url: newTabUrl,
          isLoading: true,
        };

        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(newId);
        setAddressBarUrl(newTabUrl);
      }

      // 4. Download link clicked: intercepted to prevent native file download, copied to clipboard, and alerted
      if (data.type === 'MEDIADECK_DOWNLOAD_CLICKED' && data.payload) {
        const payload = data.payload;
        const streamUrl = payload.url;
        const streamTitle = payload.title || 'Captured Video Stream';
        const streamType = payload.type || 'mp4';
        const streamId = `sniff-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

        // Automatically copy direct download stream link to clipboard
        try {
          navigator.clipboard.writeText(streamUrl);
        } catch {}

        const item: SniffedMediaItem = {
          id: streamId,
          url: streamUrl,
          title: streamTitle,
          type: streamType,
          sourcePageUrl: activeTab?.url || '',
          timestamp: Date.now(),
        };

        setSniffedStreams((prev) => {
          if (prev.some((s) => s.url === item.url)) return prev;
          return [item, ...prev];
        });

        setDownloadToast({
          id: streamId,
          url: streamUrl,
          title: streamTitle,
          type: streamType,
        });

        if (toastTimerRef.current) {
          window.clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = window.setTimeout(() => {
          setDownloadToast(null);
        }, 10000);
      }
    };

    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [isOpen]);

  if (!isOpen) return null;

  // Tab operations
  const handleNewTab = (customUrl?: string, customTitle?: string) => {
    const targetUrl = customUrl || 'https://archive.org/details/movies';
    let tabTitle = customTitle || 'New Tab';
    try {
      tabTitle = new URL(targetUrl).hostname || tabTitle;
    } catch {}

    const newId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newTab: BrowserTab = {
      id: newId,
      title: tabTitle,
      url: targetUrl,
      isLoading: true,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setAddressBarUrl(targetUrl);
  };

  const handleCloseTab = (tabIdToClose: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    // If only 1 tab remaining, close the browser modal
    if (tabs.length <= 1) {
      onClose();
      return;
    }

    const closedIndex = tabs.findIndex((t) => t.id === tabIdToClose);
    const newTabs = tabs.filter((t) => t.id !== tabIdToClose);

    if (activeTabId === tabIdToClose) {
      const nextActive = newTabs[Math.max(0, closedIndex - 1)] || newTabs[0];
      setActiveTabId(nextActive.id);
      setAddressBarUrl(nextActive.url);
    }

    setTabs(newTabs);
    iframeRefs.current.delete(tabIdToClose);
  };

  const handleSelectTab = (tabId: string) => {
    setActiveTabId(tabId);
    const selected = tabs.find((t) => t.id === tabId);
    if (selected) {
      setAddressBarUrl(selected.url);
    }
  };

  const handleNavigate = (urlToNavigate: string) => {
    let clean = urlToNavigate.trim();
    if (!clean) return;

    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }

    setAddressBarUrl(clean);

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId) {
          let derivedTitle = t.title;
          try {
            derivedTitle = new URL(clean).hostname;
          } catch {}
          return {
            ...t,
            url: clean,
            title: derivedTitle,
            isLoading: true,
          };
        }
        return t;
      })
    );

    const iframe = iframeRefs.current.get(activeTabId);
    if (iframe) {
      iframe.src = `/api/browser/proxy?url=${encodeURIComponent(clean)}&adblock=${adBlockEnabled ? '1' : '0'}`;
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleNavigate(addressBarUrl);
  };

  const handleToggleAdBlock = () => {
    const nextState = !adBlockEnabled;
    setAdBlockEnabled(nextState);
    try {
      localStorage.setItem('mediadeck_adblock_enabled', String(nextState));
    } catch {}

    // Reload active tab with updated adblock param
    if (activeTab) {
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: true } : t))
      );
      const iframe = iframeRefs.current.get(activeTabId);
      if (iframe) {
        iframe.src = `/api/browser/proxy?url=${encodeURIComponent(activeTab.url)}&adblock=${nextState ? '1' : '0'}`;
      }
    }
  };

  const handleIframeLoad = (tabId: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, isLoading: false } : t))
    );

    try {
      const iframe = iframeRefs.current.get(tabId);
      const docTitle = iframe?.contentDocument?.title;
      const currentLoc = iframe?.contentWindow?.location.href;

      if (currentLoc && currentLoc.includes('/api/browser/proxy?url=')) {
        const urlParam = new URL(currentLoc).searchParams.get('url');
        if (urlParam) {
          setTabs((prev) =>
            prev.map((t) => {
              if (t.id === tabId) {
                let displayTitle = t.title;
                if (docTitle && docTitle.trim() && !docTitle.includes('502') && !docTitle.includes('404')) {
                  displayTitle = docTitle.trim();
                } else {
                  try {
                    displayTitle = new URL(urlParam).hostname;
                  } catch {}
                }
                return {
                  ...t,
                  url: urlParam,
                  title: displayTitle,
                  isLoading: false,
                };
              }
              return t;
            })
          );

          if (tabId === activeTabId) {
            setAddressBarUrl(urlParam);
          }
        }
      }
    } catch {
      // Cross-origin restriction expected for some domains
    }
  };

  const handleBack = () => {
    try {
      iframeRefs.current.get(activeTabId)?.contentWindow?.history.back();
    } catch {}
  };

  const handleForward = () => {
    try {
      iframeRefs.current.get(activeTabId)?.contentWindow?.history.forward();
    } catch {}
  };

  const handleReload = () => {
    if (activeTab) {
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: true } : t))
      );
      const iframe = iframeRefs.current.get(activeTabId);
      if (iframe) {
        iframe.src = `/api/browser/proxy?url=${encodeURIComponent(activeTab.url)}&adblock=${adBlockEnabled ? '1' : '0'}`;
      }
    }
  };

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${styles.browserContainer} ${isMaximized ? styles.maximized : ''}`}>
        {/* Tab Bar with Multi-Tab Management */}
        <div className={styles.tabBar}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className={`${styles.tabItem} ${isActive ? styles.tabItemActive : ''}`}
                onClick={() => handleSelectTab(tab.id)}
                title={tab.url}
              >
                {tab.isLoading ? (
                  <div className={styles.tabSpinner} />
                ) : (
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>📄</span>
                )}

                <span className={styles.tabTitle}>{tab.title}</span>

                <button
                  type="button"
                  className={styles.tabCloseBtn}
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  title="Close tab"
                >
                  ✕
                </button>
              </div>
            );
          })}

          {/* New Tab '+' Button */}
          <button
            type="button"
            className={styles.newTabBtn}
            onClick={() => handleNewTab()}
            title="Open new tab"
          >
            +
          </button>
        </div>

        {/* Navigation & Sniffer Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.navControls}>
            <button type="button" className={styles.navBtn} onClick={handleBack} title="Back">
              ◀
            </button>
            <button type="button" className={styles.navBtn} onClick={handleForward} title="Forward">
              ▶
            </button>
            <button type="button" className={styles.navBtn} onClick={handleReload} title="Reload">
              ⟳
            </button>
          </div>

          <form className={styles.addressForm} onSubmit={handleFormSubmit}>
            <div className={styles.addressInputWrapper}>
              <span style={{ fontSize: '0.85rem', opacity: 0.6 }}>🌐</span>
              <input
                type="text"
                className={styles.addressInput}
                value={addressBarUrl}
                onChange={(e) => setAddressBarUrl(e.target.value)}
                placeholder="Enter website URL to browse and capture video..."
              />
              <button type="submit" className={styles.goBtn}>
                Go
              </button>
            </div>
          </form>

          <div className={styles.toolbarActions}>
            {/* Ad Blocker Toggle Button */}
            <button
              type="button"
              className={`${styles.adBlockBtn} ${adBlockEnabled ? styles.adBlockActive : styles.adBlockInactive}`}
              onClick={handleToggleAdBlock}
              title={`Ad Blocker: ${adBlockEnabled ? 'Active (Blocking ads and popups)' : 'Disabled'}. Click to toggle.`}
            >
              <span>{adBlockEnabled ? '🛡️ Ads Blocked' : '🛡️ Ads Allowed'}</span>
              {blockedAdsCount > 0 && adBlockEnabled && (
                <span className={styles.adBlockCount}>{blockedAdsCount}</span>
              )}
            </button>

            {/* 1DM Media Sniffer Counter Badge */}
            <button
              type="button"
              className={styles.snifferBtn}
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              title="Click to view captured video streams"
            >
              <span>🎬 Sniffer</span>
              <span className={styles.snifferCount}>{sniffedStreams.length}</span>
            </button>

            {/* Maximize & Close buttons */}
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? '🗗' : '🗖'}
            </button>

            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              title="Close Browser"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Intercepted Download Banner */}
        {downloadToast && (
          <div className={styles.downloadToast}>
            <div className={styles.toastLeft}>
              <span className={styles.toastIcon}>🎬</span>
              <div className={styles.toastInfo}>
                <div className={styles.toastTitle}>
                  <strong>Download Link Captured & Copied to Clipboard!</strong>
                </div>
                <div className={styles.toastName} title={downloadToast.title}>
                  {downloadToast.title}
                </div>
              </div>
            </div>
            <div className={styles.toastActions}>
              <button
                type="button"
                className={styles.toastPlayBtn}
                onClick={() => {
                  const streamItem: SniffedMediaItem = {
                    id: downloadToast.id,
                    url: downloadToast.url,
                    title: downloadToast.title,
                    type: downloadToast.type as any,
                    sourcePageUrl: activeTab?.url || '',
                    timestamp: Date.now(),
                  };
                  setDownloadToast(null);
                  onClose();
                  onPlayStream(streamItem);
                }}
              >
                ▶ Play in MediaDeck
              </button>
              <button
                type="button"
                className={styles.toastCloseBtn}
                onClick={() => setDownloadToast(null)}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Loading Progress Bar for active tab */}
        {activeTab?.isLoading && <div className={styles.progressBar} />}

        {/* Multi-Iframe Webview Container & Sniffer Drawer */}
        <div className={styles.webviewWrapper}>
          {tabs.map((tab) => {
            const proxySrc = `/api/browser/proxy?url=${encodeURIComponent(tab.url)}&adblock=${adBlockEnabled ? '1' : '0'}`;
            return (
              <iframe
                key={tab.id}
                ref={(el) => {
                  if (el) iframeRefs.current.set(tab.id, el);
                  else iframeRefs.current.delete(tab.id);
                }}
                src={proxySrc}
                className={styles.webviewFrame}
                style={{ display: tab.id === activeTabId ? 'block' : 'none' }}
                sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-modals"
                onLoad={() => handleIframeLoad(tab.id)}
                title={tab.title}
              />
            );
          })}

          {/* 1DM Captured Streams Sliding Drawer */}
          <SnifferDrawer
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            streams={sniffedStreams}
            onPlayStream={(stream) => {
              setIsDrawerOpen(false);
              onClose();
              onPlayStream(stream);
            }}
            onClearStreams={() => setSniffedStreams([])}
          />
        </div>
      </div>
    </div>
  );
};
