import React, { useState, useEffect } from 'react';
import styles from './URLInput.module.css';

interface URLInputProps {
  onLoadUrl: (url: string) => void;
  isLoading: boolean;
  initialUrl?: string;
}

const SAMPLE_URLS = [
  {
    name: 'MP4 (Big Buck Bunny 720p)',
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_5MB.mp4',
  },
  {
    name: 'HLS Stream (BBB Adaptive)',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
  {
    name: 'DASH Stream (Akamai BBB)',
    url: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
  },
  {
    name: 'WebM Video (BBB VP8)',
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/webm/vp8/720/Big_Buck_Bunny_720_10s_5MB.webm',
  },
  {
    name: 'Google Drive (Shared Video)',
    url: 'https://drive.google.com/file/d/1mFqzNxWYF1yydDvj2xR9Sa234lpKHrNc/view?usp=sharing',
  },
];

const MAX_RECENTS = 5;

export const URLInput: React.FC<URLInputProps> = ({ onLoadUrl, isLoading, initialUrl = '' }) => {
  const [url, setUrl] = useState(initialUrl);
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mediadeck_recent_urls');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
    }
  }, [initialUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    // Save to recents
    const updated = [cleanUrl, ...recents.filter((r) => r !== cleanUrl)].slice(0, MAX_RECENTS);
    setRecents(updated);
    try {
      localStorage.setItem('mediadeck_recent_urls', JSON.stringify(updated));
    } catch {
      // ignore
    }

    onLoadUrl(cleanUrl);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
      }
    } catch {
      // clipboard permission might be denied
    }
  };

  const handleClear = () => {
    setUrl('');
  };

  const handleSelectRecent = (recentUrl: string) => {
    setUrl(recentUrl);
    onLoadUrl(recentUrl);
  };

  const handleClearRecents = () => {
    setRecents([]);
    localStorage.removeItem('mediadeck_recent_urls');
  };

  return (
    <div className={styles.container}>
      <form onSubmit={handleSubmit}>
        <div className={styles.inputGroup}>
          <div className={styles.inputMain}>
            <div className={styles.inputIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
            </div>

            <input
              type="url"
              className={styles.input}
              placeholder="Paste a video URL (MP4, HLS, DASH, or page URL)..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              required
            />

            {url && (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={handleClear}
                title="Clear input"
                aria-label="Clear input"
              >
                ✕
              </button>
            )}
          </div>

          <div className={styles.buttonGroup}>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={handlePaste}
              title="Paste from clipboard"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
              </svg>
              <span>Paste</span>
            </button>

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isLoading || !url.trim()}
            >
              {isLoading ? (
                <span>Analyzing...</span>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  <span>Play / Load</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Quick sample URLs for easy verification */}
      <div className={styles.samplesRow}>
        <span className={styles.sampleLabel}>Test Samples:</span>
        {SAMPLE_URLS.map((sample) => (
          <button
            key={sample.name}
            type="button"
            className={styles.sampleChip}
            onClick={() => {
              setUrl(sample.url);
              onLoadUrl(sample.url);
            }}
          >
            {sample.name}
          </button>
        ))}
      </div>

      {/* Recents list if available */}
      {recents.length > 0 && (
        <div className={styles.recentsSection}>
          <div className={styles.recentsHeader}>
            <span>Recent URLs</span>
            <button type="button" className={styles.clearRecentsBtn} onClick={handleClearRecents}>
              Clear History
            </button>
          </div>
          <div className={styles.recentsList}>
            {recents.map((recentUrl) => (
              <button
                key={recentUrl}
                type="button"
                className={styles.recentItem}
                onClick={() => handleSelectRecent(recentUrl)}
                title={recentUrl}
              >
                <span>🔗</span>
                <span>{recentUrl}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
