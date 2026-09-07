import React, { useRef, useEffect, useState, useCallback } from 'react';
import shaka from 'shaka-player';
import type { StreamInfo } from '@video-player/shared';
import styles from './Player.module.css';
import { Controls } from './Controls.js';
import { QualityTrack } from './QualityMenu.js';
import { formatBitrate, formatBytes, formatTime } from '../../utils/format.js';
import { AdvancedStatsModal } from './AdvancedStatsModal.js';

interface VideoPlayerProps {
  stream: StreamInfo;
  mediaDuration?: number;
  poster?: string;
  initialTime?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onOpenShortcuts: () => void;
  onError: (error: string) => void;
  onRefreshSource?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  stream,
  mediaDuration,
  poster,
  initialTime = 0,
  onTimeUpdate: onTimeUpdateProp,
  onOpenShortcuts,
  onError,
  onRefreshSource,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<shaka.Player | null>(null);

  // Fallback guard to strictly prevent infinite reload loops
  const hasTriedFallback = useRef(false);

  // Resume playback notification state and guard
  const hasResumedRef = useRef(false);
  const [resumeNotice, setResumeNotice] = useState<{ time: number } | null>(null);
  const onTimeUpdatePropRef = useRef(onTimeUpdateProp);
  onTimeUpdatePropRef.current = onTimeUpdateProp;

  // Stream offset for remux streams seeking beyond buffer
  const initialOffset = initialTime > 3 && (stream.url.includes('/api/stream/remux') || (stream.proxyUrl && stream.proxyUrl.includes('/api/stream/remux'))) ? Math.floor(initialTime) : 0;
  const [streamOffset, setStreamOffset] = useState<number>(initialOffset);
  const streamOffsetRef = useRef<number>(initialOffset);
  streamOffsetRef.current = streamOffset;

  const mediaDurationRef = useRef<number | undefined>(mediaDuration);
  mediaDurationRef.current = mediaDuration;

  // Active source for progressive (non-Shaka) media: prioritize proxyUrl if stream requires proxy
  // MKV Guardian: Never pass raw MKV directly to <video> when remux/proxy is available
  const getPlayableSource = useCallback((s: StreamInfo, startAt = 0) => {
    let src = s.requiresProxy && s.proxyUrl ? s.proxyUrl : s.url;
    const isMkv = s.type === 'mkv' || s.url.toLowerCase().includes('.mkv') || src.toLowerCase().includes('.mkv');
    if (isMkv && !src.includes('/api/stream/remux')) {
      if (src.includes('/api/proxy')) {
        src = src.replace('/api/proxy', '/api/stream/remux');
      } else if (s.proxyUrl && s.proxyUrl.includes('/api/proxy')) {
        src = s.proxyUrl.replace('/api/proxy', '/api/stream/remux');
      }
    }
    if (startAt > 3 && src.includes('/api/stream/remux')) {
      try {
        const u = new URL(src, window.location.origin);
        u.searchParams.set('startTime', String(Math.floor(startAt)));
        src = u.toString();
      } catch {}
    }
    return src;
  }, []);

  const [activeSource, setActiveSource] = useState<string>(() => getPlayableSource(stream, initialTime));

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialTime > 3 ? initialTime : 0);
  const [duration, setDuration] = useState<number>(() => (mediaDuration && isFinite(mediaDuration) && mediaDuration > 0 ? mediaDuration : 0));
  const durationRef = useRef<number>(duration);
  durationRef.current = duration;

  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isLoadingMedia, setIsLoadingMedia] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Connecting to media stream...');
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [bufferedSecondsAhead, setBufferedSecondsAhead] = useState(0);
  const [streamingSpeed, setStreamingSpeed] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [showAdvancedData, setShowAdvancedData] = useState(false);

  useEffect(() => {
    const shouldOffset = initialTime > 3 && (stream.url.includes('/api/stream/remux') || (stream.proxyUrl && stream.proxyUrl.includes('/api/stream/remux')));
    const off = shouldOffset ? Math.floor(initialTime) : 0;
    setStreamOffset(off);
    setActiveSource(getPlayableSource(stream, initialTime));
    hasTriedFallback.current = false;
    hasResumedRef.current = false;
    setCurrentTime(initialTime > 3 ? initialTime : 0);
    setDownloadedBytes(0);
    setStreamingSpeed(0);
    setBufferedPercent(0);
    setBufferedSecondsAhead(0);
    if (mediaDuration && isFinite(mediaDuration) && mediaDuration > 0) {
      setDuration(mediaDuration);
    }
  }, [stream, getPlayableSource, mediaDuration, initialTime]);

  useEffect(() => {
    if (resumeNotice) {
      const timer = window.setTimeout(() => setResumeNotice(null), 5500);
      return () => window.clearTimeout(timer);
    }
  }, [resumeNotice]);

  // Effective duration calculation
  const effectiveDuration =
    isFinite(duration) && duration > 0
      ? duration
      : mediaDuration && isFinite(mediaDuration) && mediaDuration > 0
      ? mediaDuration
      : isFinite(videoRef.current?.duration || 0) && (videoRef.current?.duration || 0) > 0
      ? (videoRef.current?.duration || 0) + streamOffset
      : 0;

  // Refs for tracking network speed & bytes
  const prevTransferSizeRef = useRef<number>(0);
  const prevMeasurementTimeRef = useRef<number>(performance.now());
  const prevBufferedEndRef = useRef<number>(0);

  // Quality tracks
  const [qualityTracks, setQualityTracks] = useState<QualityTrack[]>([]);
  const [selectedQualityId, setSelectedQualityId] = useState<number | string | 'auto'>('auto');

  // Controls visibility timer
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  // Touch tracking to isolate synthetic mobile mouse movements
  const isTouchRef = useRef(false);
  const touchTimeoutRef = useRef<number | null>(null);

  // Mobile double-tap gestures and ripple animation state
  const [ripple, setRipple] = useState<{ side: 'left' | 'right'; id: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const lastTapXRef = useRef<number>(0);
  const singleTapTimerRef = useRef<number | null>(null);

  const resetHideTimer = useCallback((timeoutMs = 4500) => {
    setControlsVisible(true);
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, timeoutMs);
  }, []);

  // Speedometer & Network Telemetry Engine
  useEffect(() => {
    let isCancelled = false;

    const poll = async () => {
      // 1. If Shaka Player is active, read estimated bandwidth
      if (playerRef.current) {
        try {
          const stats = playerRef.current.getStats();
          if (stats.estimatedBandwidth && stats.estimatedBandwidth > 0) {
            setStreamingSpeed(Math.round(stats.estimatedBandwidth / 8));
          }
        } catch {}
        return;
      }

      // 2. Authoritative Server Stream Telemetry
      let gotServerTelemetry = false;
      if (activeSource.includes('/api/stream/remux') || activeSource.includes('/api/proxy')) {
        try {
          const res = await fetch(`/api/stream/telemetry?url=${encodeURIComponent(activeSource)}`);
          if (res.ok) {
            const data = await res.json();
            if (!isCancelled && data) {
              if (typeof data.duration === 'number' && data.duration > 0) {
                setDuration((prev) => (!isFinite(prev) || prev <= 0 ? data.duration : prev));
              }
              if (typeof data.bytesTransferred === 'number' && data.bytesTransferred > 0) {
                setDownloadedBytes(data.bytesTransferred);
                gotServerTelemetry = true;
              }
              if (typeof data.speedBytesPerSec === 'number' && data.speedBytesPerSec > 0) {
                setStreamingSpeed(data.speedBytesPerSec);
                gotServerTelemetry = true;
              }
            }
          }
        } catch {}
      }

      if (gotServerTelemetry) {
        return;
      }

      // 3. Fallback: Progressive media measure using PerformanceResourceTiming
      const now = performance.now();
      const deltaTime = (now - prevMeasurementTimeRef.current) / 1000;
      let calculatedFromTiming = false;

      if (window.performance && typeof window.performance.getEntriesByName === 'function') {
        const entries = window.performance.getEntriesByName(activeSource) as PerformanceResourceTiming[];
        if (entries && entries.length > 0) {
          const latest = entries[entries.length - 1];
          const transferSize = latest.transferSize || latest.encodedBodySize || 0;
          if (transferSize > 0) {
            setDownloadedBytes(transferSize);
            if (deltaTime >= 0.8) {
              const deltaBytes = transferSize - prevTransferSizeRef.current;
              if (deltaBytes > 0) {
                const speed = Math.round(deltaBytes / deltaTime);
                setStreamingSpeed(speed);
                calculatedFromTiming = true;
              } else if (!isBuffering && isPlaying) {
                setStreamingSpeed((prev) => Math.max(0, Math.round(prev * 0.75)));
                calculatedFromTiming = true;
              }
              prevTransferSizeRef.current = transferSize;
              prevMeasurementTimeRef.current = now;
            }
          }
        }
      }

      // 4. Fallback: Measure buffer growth if transfer timing is unavailable
      if (!calculatedFromTiming && videoRef.current && deltaTime >= 0.8) {
        const video = videoRef.current;
        if (video.buffered.length > 0) {
          const currentBuffered = video.buffered.end(video.buffered.length - 1);
          const deltaBuffered = currentBuffered - prevBufferedEndRef.current;
          prevBufferedEndRef.current = currentBuffered;

          if (deltaBuffered > 0) {
            const estimatedBps = stream.bitrate ? Math.round(stream.bitrate / 8) : 1_250_000;
            const speed = Math.round((deltaBuffered * estimatedBps) / deltaTime);
            setStreamingSpeed(speed);
          } else if (!isBuffering) {
            setStreamingSpeed((prev) => Math.max(0, Math.round(prev * 0.5)));
          }
        }
        prevMeasurementTimeRef.current = now;
      }
    };

    // Fast initial polls to grab duration & initial speed immediately
    const t1 = window.setTimeout(poll, 250);
    const t2 = window.setTimeout(poll, 650);
    const interval = window.setInterval(poll, 1000);

    return () => {
      isCancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearInterval(interval);
    };
  }, [activeSource, isBuffering, isPlaying, stream.bitrate]);

  // Determine if stream requires Shaka Player (adaptive HLS/DASH)
  const isAdaptive = stream.type === 'hls' || stream.type === 'dash';

  // 1. Adaptive stream playback via Shaka Player
  useEffect(() => {
    if (!isAdaptive) return;

    const video = videoRef.current;
    if (!video) return;

    hasTriedFallback.current = false;
    shaka.polyfill.installAll();

    if (!shaka.Player.isBrowserSupported()) {
      onError('Browser does not support the necessary media decoding features for this stream.');
      return;
    }

    const player = new shaka.Player();
    player.attach(video);
    playerRef.current = player;

    // Listen to runtime errors during playback (ignore 7000: LOAD_INTERRUPTED)
    player.addEventListener('error', (event: any) => {
      const error = event.detail;
      if (error && error.code === 7000) {
        // Benign load interruption from previous destroyed instance
        return;
      }
      console.warn('Shaka runtime error:', error);
      onError(`Playback error (${error.category || 'PLAYER'}/${error.code}): ${error.message || 'Stream error'}`);
    });

    // Listen to track changes (quality representations)
    player.addEventListener('trackschanged', () => {
      const variants = player.getVariantTracks();
      const mapped: QualityTrack[] = variants
        .filter((v) => v.videoId !== null && v.height !== null)
        .map((v) => ({
          id: v.id,
          label: `${v.height}p${v.bandwidth ? ` (${formatBitrate(v.bandwidth)})` : ''}`,
          width: v.width || undefined,
          height: v.height || undefined,
          bitrate: v.bandwidth || undefined,
          active: v.active,
        }))
        .sort((a, b) => (b.height || 0) - (a.height || 0));

      const uniqueMap = new Map<number, QualityTrack>();
      for (const track of mapped) {
        if (track.height && !uniqueMap.has(track.height)) {
          uniqueMap.set(track.height, track);
        }
      }
      setQualityTracks(Array.from(uniqueMap.values()));
    });

    // Listen to buffering state
    player.addEventListener('buffering', (event: any) => {
      setIsBuffering(event.buffering);
    });

    // Load media: try direct URL first, fallback once to proxy if CORS/network fails
    player
      .load(stream.url)
      .then(() => {
        console.info('Loaded adaptive stream with Shaka Player:', stream.url);
      })
      .catch((err) => {
        if (err && err.code === 7000) return; // Load was interrupted, ignore

        if (!hasTriedFallback.current && stream.proxyUrl) {
          hasTriedFallback.current = true;
          console.info('Direct load failed, falling back to secure proxy URL:', stream.proxyUrl);
          player.load(stream.proxyUrl).catch((proxyErr) => {
            if (proxyErr && proxyErr.code === 7000) return;
            onError(`Playback failed: ${proxyErr.message || 'Error streaming media'}`);
          });
        } else {
          onError(`Failed to load stream: ${err.message || 'Unable to play stream'}`);
        }
      });

    return () => {
      player.destroy().catch(() => {});
      playerRef.current = null;
    };
  }, [isAdaptive, stream.url, stream.proxyUrl, onError]);

  // 2. Progressive media playback (MP4 / WebM / Audio) via native <video> element
  useEffect(() => {
    if (isAdaptive) return;

    hasTriedFallback.current = false;
    const initial = stream.requiresProxy && stream.proxyUrl ? stream.proxyUrl : stream.url;
    setActiveSource(initial);
  }, [isAdaptive, stream.url, stream.proxyUrl, stream.requiresProxy]);

  // Handle native video element error for progressive media
  const handleNativeVideoError = useCallback(() => {
    if (isAdaptive) return;

    const mediaError = videoRef.current?.error;
    const isFormatOrDecodeError = mediaError && (mediaError.code === 4 || mediaError.code === 3);
    const isMkvStream =
      stream.url.toLowerCase().includes('.mkv') ||
      Boolean(stream.mimeType?.includes('matroska')) ||
      Boolean(stream.label?.toLowerCase().includes('mkv'));

    // If browser rejects MKV container or can't decode, auto-switch to zero-re-encode fragmented MP4 remux route
    if (isFormatOrDecodeError && isMkvStream && !activeSource.includes('/api/stream/remux')) {
      const remuxSource = activeSource.includes('/api/proxy')
        ? activeSource.replace('/api/proxy', '/api/stream/remux')
        : `/api/stream/remux?url=${encodeURIComponent(stream.url)}`;
      console.info('Native MKV container format error, auto-switching to fragmented MP4 remux:', remuxSource);
      setLoadingStatus('Format not supported natively, switching to seamless MP4 remux...');
      setIsLoadingMedia(true);
      setActiveSource(remuxSource);
      return;
    }

    // Attempt bidirectional fallback between direct URL and proxyUrl
    const fallbackSource = activeSource === stream.url ? stream.proxyUrl : stream.url;
    if (!hasTriedFallback.current && fallbackSource && activeSource !== fallbackSource) {
      hasTriedFallback.current = true;
      console.info(`Primary media load failed (${activeSource}), attempting fallback: ${fallbackSource}`);
      setActiveSource(fallbackSource);
      return;
    }

    let detailMsg = 'The file or codec is unsupported or unavailable.';
    if (mediaError) {
      if (mediaError.code === 1) detailMsg = 'Video playback was aborted.';
      else if (mediaError.code === 2) detailMsg = 'A network error occurred while fetching the video. If using a temporary link, it may have expired.';
      else if (mediaError.code === 3) detailMsg = 'Failed to decode media. The codec may not be supported by your browser.';
      else if (mediaError.code === 4) detailMsg = 'Media stream is unavailable or the streaming link has expired.';
      if (mediaError.message) detailMsg += ` (${mediaError.message})`;
    }
    if (onRefreshSource && mediaError && (mediaError.code === 2 || mediaError.code === 4)) {
      detailMsg += ' If this stream link has expired, click "Refresh Link from Source".';
    }

    setIsLoadingMedia(false);
    setIsBuffering(false);
    onError(`Unable to play video. ${detailMsg}`);
  }, [isAdaptive, stream.url, stream.proxyUrl, stream.mimeType, stream.label, activeSource, onError, onRefreshSource]);

  // Video element event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadStart = () => {
      setIsLoadingMedia(true);
      setLoadingStatus('Connecting to media stream...');
    };
    const onLoadedMetadata = () => {
      const vidDur = video.duration;
      if (isFinite(vidDur) && vidDur > 0) {
        setDuration(vidDur + streamOffsetRef.current);
      } else if (mediaDurationRef.current && mediaDurationRef.current > 0) {
        setDuration(mediaDurationRef.current);
      }
      setVideoDimensions({ width: video.videoWidth || 0, height: video.videoHeight || 0 });
      setLoadingStatus('Metadata loaded, preparing playback...');
    };
    const onCanPlay = () => {
      setIsLoadingMedia(false);
      setIsBuffering(false);

      // Auto-resume playback position if initialTime was specified
      if (initialTime > 3 && !hasResumedRef.current) {
        hasResumedRef.current = true;
        setResumeNotice({ time: initialTime });
        if (!activeSource.includes('/api/stream/remux')) {
          video.currentTime = initialTime;
        }
      }

      if (video.paused && !isAutoplayBlocked) {
        video.play().then(() => {
          setIsAutoplayBlocked(false);
        }).catch((err: any) => {
          if (err && err.name === 'NotAllowedError') {
            setIsAutoplayBlocked(true);
            setIsBuffering(false);
            setIsLoadingMedia(false);
          }
        });
      }
    };
    const onPlay = () => {
      setIsPlaying(true);
      setIsLoadingMedia(false);
      setIsBuffering(false);
      setIsAutoplayBlocked(false);
      resetHideTimer(4500);
    };
    const onPause = () => {
      setIsPlaying(false);
      setControlsVisible(true);
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      const cur = (video.currentTime || 0) + streamOffsetRef.current;
      const effDur = durationRef.current > 0 ? durationRef.current : (mediaDurationRef.current || 0);
      onTimeUpdatePropRef.current?.(cur, effDur);
    };
    const onWaiting = () => {
      setIsBuffering(true);
      setLoadingStatus('Buffering media...');
    };
    const onSeeking = () => {
      setIsBuffering(true);
      setLoadingStatus('Seeking to position...');
    };
    const onSeeked = () => {
      setIsBuffering(false);
    };
    const onTimeUpdate = () => {
      const cur = (video.currentTime || 0) + streamOffsetRef.current;
      setCurrentTime(cur);
      const effDur = durationRef.current > 0 ? durationRef.current : (mediaDurationRef.current || 0);
      onTimeUpdatePropRef.current?.(cur, effDur);
      if (video.buffered.length > 0) {
        let endAhead = 0;
        const vCur = video.currentTime || 0;
        for (let i = 0; i < video.buffered.length; i++) {
          const start = video.buffered.start(i);
          const end = video.buffered.end(i);
          if (vCur >= start && vCur <= end) {
            endAhead = end;
            break;
          }
        }
        if (endAhead > 0) {
          setBufferedSecondsAhead(Math.max(0, endAhead - vCur));
        }
      }
    };
    const onDurationChange = () => {
      const vidDur = video.duration;
      if (isFinite(vidDur) && vidDur > 0) {
        setDuration(vidDur + streamOffsetRef.current);
      } else if (mediaDurationRef.current && mediaDurationRef.current > 0) {
        setDuration(mediaDurationRef.current);
      }
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const onProgress = () => {
      if (video.buffered.length > 0) {
        const vCur = video.currentTime || 0;
        let endAhead = 0;
        for (let i = 0; i < video.buffered.length; i++) {
          const start = video.buffered.start(i);
          const end = video.buffered.end(i);
          if (vCur >= start && vCur <= end) {
            endAhead = end;
            break;
          }
        }
        if (endAhead === 0 && video.buffered.length > 0) {
          endAhead = video.buffered.end(video.buffered.length - 1);
        }
        const effectiveEnd = endAhead + streamOffsetRef.current;
        setBufferedEnd(effectiveEnd);

        const currentDur = isFinite(durationRef.current) && durationRef.current > 0
          ? durationRef.current
          : (mediaDurationRef.current || 0);
        if (currentDur > 0) {
          setBufferedPercent(Math.min(100, (effectiveEnd / currentDur) * 100));
        }
        setBufferedSecondsAhead(Math.max(0, endAhead - vCur));
      }
    };
    const onRateChange = () => setPlaybackRate(video.playbackRate);

    video.addEventListener('loadstart', onLoadStart);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('progress', onProgress);
    video.addEventListener('ratechange', onRateChange);

    return () => {
      video.removeEventListener('loadstart', onLoadStart);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('ratechange', onRateChange);
    };
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Picture-in-picture listener
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnterPiP = () => setIsPiP(true);
    const handleLeavePiP = () => setIsPiP(false);

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, []);

  // Control action handlers
  const handleTogglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setIsAutoplayBlocked(false);
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  const handleSeek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;

    const maxT = effectiveDuration > 0 ? effectiveDuration : Infinity;
    const targetTime = Math.max(0, Math.min(time, maxT));

    // For remuxed streams: check if target is inside currently buffered range of the stream
    if (activeSource.includes('/api/stream/remux')) {
      const relTarget = targetTime - streamOffset;
      let isTargetBuffered = false;
      if (relTarget >= 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          if (relTarget >= video.buffered.start(i) && relTarget <= video.buffered.end(i)) {
            isTargetBuffered = true;
            break;
          }
        }
      }

      if (!isTargetBuffered) {
        try {
          const newOffset = Math.floor(targetTime);
          setStreamOffset(newOffset);
          setCurrentTime(targetTime);
          const urlObj = new URL(activeSource, window.location.origin);
          urlObj.searchParams.set('startTime', String(newOffset));
          setActiveSource(urlObj.toString());
          setIsLoadingMedia(true);
          setLoadingStatus(`Seeking to ${formatTime(targetTime)}...`);
          return;
        } catch {}
      } else {
        video.currentTime = relTarget;
        return;
      }
    }

    // For native progressive or Shaka adaptive:
    video.currentTime = targetTime;
  }, [activeSource, effectiveDuration, streamOffset]);

  const handleVolumeChange = useCallback((newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVolume;
    video.muted = newVolume === 0;
  }, []);

  const handleToggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const handleSelectRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
  }, []);

  const handleSelectQuality = useCallback((trackId: number | string | 'auto') => {
    const player = playerRef.current;
    if (!player) return;

    setSelectedQualityId(trackId);

    if (trackId === 'auto') {
      player.configure({ abr: { enabled: true } });
    } else {
      player.configure({ abr: { enabled: false } });
      const tracks = player.getVariantTracks();
      const target = tracks.find((t) => t.id === trackId);
      if (target) {
        player.selectVariantTrack(target, true);
      }
    }
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleTogglePiP = useCallback(() => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;

    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else {
      video.requestPictureInPicture().catch(() => {});
    }
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      resetHideTimer();

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          handleTogglePlay();
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          handleSeek(currentTime - (e.shiftKey ? 10 : 5));
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          handleSeek(currentTime + (e.shiftKey ? 10 : 5));
          break;
        case 'arrowup':
          e.preventDefault();
          handleVolumeChange(Math.min(1, volume + 0.05));
          break;
        case 'arrowdown':
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 0.05));
          break;
        case 'm':
          e.preventDefault();
          handleToggleMute();
          break;
        case 'f':
          e.preventDefault();
          handleToggleFullscreen();
          break;
        case 'p':
          e.preventDefault();
          handleTogglePiP();
          break;
        case 'd':
          e.preventDefault();
          setShowAdvancedData((prev) => !prev);
          break;
        case 'escape':
          if (showAdvancedData) {
            e.preventDefault();
            setShowAdvancedData(false);
          }
          break;
        case '?':
          e.preventDefault();
          onOpenShortcuts();
          break;
        default:
          if (e.key >= '0' && e.key <= '9' && effectiveDuration > 0) {
            e.preventDefault();
            const percent = parseInt(e.key, 10) / 10;
            handleSeek(effectiveDuration * percent);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentTime,
    effectiveDuration,
    volume,
    handleTogglePlay,
    handleSeek,
    handleVolumeChange,
    handleToggleMute,
    handleToggleFullscreen,
    handleTogglePiP,
    onOpenShortcuts,
    resetHideTimer,
  ]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // If click is on interactive controls, reset timer and prevent dismissing
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('[role="slider"]') ||
      target.closest(`.${styles.controlsOverlay}`) ||
      target.closest(`.${styles.statsModal}`)
    ) {
      resetHideTimer(4500);
      return;
    }

    const now = performance.now();
    const rect = containerRef.current?.getBoundingClientRect();
    const clickX = rect ? e.clientX - rect.left : 0;
    const width = rect ? rect.width : 0;
    const isDoubleTap = now - lastTapTimeRef.current < 300 && Math.abs(clickX - lastTapXRef.current) < 80;

    lastTapTimeRef.current = now;
    lastTapXRef.current = clickX;

    if (isDoubleTap) {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      // Left 35% -> Rewind 10s
      if (clickX < width * 0.35) {
        handleSeek(Math.max(0, currentTime - 10));
        setRipple({ side: 'left', id: now });
        setTimeout(() => setRipple(null), 650);
        return;
      }
      // Right 35% -> Forward 10s
      if (clickX > width * 0.65) {
        const maxT = effectiveDuration > 0 ? effectiveDuration : Infinity;
        handleSeek(Math.min(maxT, currentTime + 10));
        setRipple({ side: 'right', id: now });
        setTimeout(() => setRipple(null), 650);
        return;
      }
      // Center double tap -> Toggle Play
      handleTogglePlay();
    } else {
      // Single tap on empty video background:
      // If controls hidden -> show them for 4.5 seconds
      // If controls visible -> hide them immediately
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      singleTapTimerRef.current = window.setTimeout(() => {
        setControlsVisible((prev) => {
          if (!prev) {
            resetHideTimer(4500);
            return true;
          } else {
            if (hideTimerRef.current) {
              window.clearTimeout(hideTimerRef.current);
              hideTimerRef.current = null;
            }
            return false;
          }
        });
      }, 240);
    }
  };

  return (
    <div
      className={styles.playerContainer}
      ref={containerRef}
      onTouchStart={() => {
        isTouchRef.current = true;
        if (touchTimeoutRef.current) window.clearTimeout(touchTimeoutRef.current);
        touchTimeoutRef.current = window.setTimeout(() => {
          isTouchRef.current = false;
        }, 1200);
      }}
      onMouseMove={() => {
        if (isTouchRef.current) return;
        resetHideTimer(4000);
      }}
      onClick={handleContainerClick}
    >
      <video
        ref={videoRef}
        src={!isAdaptive ? activeSource : undefined}
        className={styles.videoElement}
        poster={poster}
        playsInline
        onError={handleNativeVideoError}
      />

      {/* Ripple Animation Overlays for Double-Tap Skip */}
      {ripple && (
        <div className={`${styles.rippleOverlay} ${ripple.side === 'left' ? styles.rippleLeft : styles.rippleRight}`}>
          <div className={styles.rippleCircle}>
            {ripple.side === 'left' ? (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>
                </svg>
                <span>10s</span>
              </>
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>
                </svg>
                <span>10s</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Buffering & Loading Indicator */}
      {(isBuffering || (isLoadingMedia && !isAdaptive) || isAutoplayBlocked) && (
        <div className={styles.bufferingOverlay}>
          <div className={styles.bufferingCard}>
            {isAutoplayBlocked ? (
              <>
                <button
                  type="button"
                  className={styles.clickToPlayBtn}
                  onClick={handleTogglePlay}
                  aria-label="Click to start playback"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  <span>Click to Play</span>
                </button>
                <div className={styles.bufferingText} style={{ marginTop: '4px', fontSize: '0.8rem', opacity: 0.8 }}>
                  Autoplay requires user interaction
                </div>
              </>
            ) : (
              <>
                <div className={styles.bufferingSpinner} />
                <div className={styles.bufferingText}>{loadingStatus}</div>
                <div className={styles.bufferingStatsBadge}>
                  {streamingSpeed > 0 ? (
                    <span>⚡ {formatBytes(streamingSpeed)}/s</span>
                  ) : (
                    <span>⚡ Connecting...</span>
                  )}
                  <span>•</span>
                  {(() => {
                    const bytePercent = stream.size && stream.size > 0 && downloadedBytes > 0
                      ? Math.min(100, (downloadedBytes / stream.size) * 100)
                      : 0;
                    const effectivePercent = bufferedPercent > 0 ? bufferedPercent : bytePercent;

                    if (effectivePercent > 0 && stream.size && stream.size > 0) {
                      return (
                        <span>
                          {effectivePercent.toFixed(1)}% ({formatBytes(downloadedBytes)} of {formatBytes(stream.size)})
                        </span>
                      );
                    }
                    if (effectivePercent > 0 && bufferedSecondsAhead > 0) {
                      return <span>{effectivePercent.toFixed(1)}% ({bufferedSecondsAhead.toFixed(1)}s ahead)</span>;
                    }
                    if (downloadedBytes > 0) {
                      return <span>{formatBytes(downloadedBytes)} loaded</span>;
                    }
                    return <span>Streaming on demand...</span>;
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Resume Playback Floating Banner */}
      {resumeNotice && (
        <div className={styles.resumeToast}>
          <span>Resumed from <strong>{formatTime(resumeNotice.time)}</strong></span>
          <button
            type="button"
            className={styles.restartBtn}
            onClick={() => {
              handleSeek(0);
              setResumeNotice(null);
            }}
          >
            Start from beginning
          </button>
          <button
            type="button"
            className={styles.dismissToastBtn}
            onClick={() => setResumeNotice(null)}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Controls Overlay */}
      <Controls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={effectiveDuration}
        bufferedEnd={bufferedEnd}
        streamingSpeed={streamingSpeed}
        volume={volume}
        isMuted={isMuted}
        playbackRate={playbackRate}
        isFullscreen={isFullscreen}
        isPiP={isPiP}
        isAdvancedDataOpen={showAdvancedData}
        qualityTracks={qualityTracks}
        selectedQualityId={selectedQualityId}
        isVisible={controlsVisible}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onVolumeChange={handleVolumeChange}
        onToggleMute={handleToggleMute}
        onSelectRate={handleSelectRate}
        onSelectQuality={handleSelectQuality}
        onToggleFullscreen={handleToggleFullscreen}
        onTogglePiP={handleTogglePiP}
        onToggleAdvancedData={() => setShowAdvancedData((prev) => !prev)}
        onOpenShortcuts={onOpenShortcuts}
      />

      {/* Advanced Data / Stats for Nerds Modal */}
      <AdvancedStatsModal
        isOpen={showAdvancedData}
        onClose={() => setShowAdvancedData(false)}
        stats={{
          currentTime,
          duration: effectiveDuration,
          bufferedEnd,
          bufferedPercent,
          bufferedSecondsAhead,
          streamingSpeed,
          downloadedBytes,
          videoWidth: videoDimensions.width,
          videoHeight: videoDimensions.height,
          isPlaying,
          isBuffering: isBuffering || (isLoadingMedia && !isAdaptive),
          playbackRate,
          stream,
          activeSource,
        }}
      />
    </div>
  );
};
