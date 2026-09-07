/**
 * Generates the client-side JavaScript injected into proxied web pages to capture
 * media streams in real time (1DM style) and suppress ad popups.
 */
export function generateSnifferScript(options: { adBlockEnabled: boolean; currentTargetUrl?: string }): string {
  return `
(function() {
  if (window.__MEDIADECK_SNIFFER_INITIALIZED__) return;
  window.__MEDIADECK_SNIFFER_INITIALIZED__ = true;

  const adBlockEnabled = ${options.adBlockEnabled ? 'true' : 'false'};
  const currentTargetUrl = ${JSON.stringify(options.currentTargetUrl || '')};
  const capturedUrls = new Set();

  function toProxyUrl(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    if (raw.startsWith('blob:') || raw.startsWith('data:') || raw.startsWith('javascript:')) return raw;
    if (raw.includes('/api/browser/proxy?url=')) return raw;

    try {
      const base = currentTargetUrl || window.location.href;
      const abs = new URL(raw, base).href;
      if (abs.startsWith('chrome:') || abs.startsWith('about:')) return raw;
      return '/api/browser/proxy?url=' + encodeURIComponent(abs) + '&adblock=' + (adBlockEnabled ? '1' : '0');
    } catch {
      return raw;
    }
  }

  function inferType(url, mime) {
    const cleanUrl = url.split('?')[0].toLowerCase();
    const cleanMime = (mime || '').toLowerCase();

    if (cleanUrl.endsWith('.m3u8') || cleanMime.includes('mpegurl')) return 'hls';
    if (cleanUrl.endsWith('.mpd') || cleanMime.includes('dash+xml')) return 'dash';
    if (cleanUrl.endsWith('.webm') || cleanMime.includes('video/webm')) return 'webm';
    if (cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.m4v') || cleanUrl.endsWith('.mov') || cleanMime.includes('video/mp4')) return 'mp4';
    if (cleanUrl.endsWith('.mkv') || cleanMime.includes('matroska')) return 'mp4';
    if (cleanUrl.endsWith('.avi') || cleanUrl.endsWith('.flv') || cleanUrl.endsWith('.wmv')) return 'mp4';
    if (cleanUrl.endsWith('.mp3') || cleanUrl.endsWith('.aac') || cleanUrl.endsWith('.wav') || cleanUrl.endsWith('.ogg') || cleanMime.includes('audio/')) return 'audio';
    if (cleanMime.startsWith('video/')) return 'mp4';
    return null;
  }

  function resolveAbsoluteUrl(rawUrl) {
    try {
      return new URL(rawUrl, window.location.href).href;
    } catch {
      return rawUrl;
    }
  }

  function reportMedia(rawUrl, mimeType, customTitle) {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) return;

    // Filter out tiny segment chunks if we already know it is an HLS or DASH stream
    const isSegment = /\\.(ts|m4s)(\\?.*)?$/i.test(rawUrl);
    if (isSegment) return;

    const absUrl = resolveAbsoluteUrl(rawUrl);
    if (capturedUrls.has(absUrl)) return;

    const streamType = inferType(absUrl, mimeType);
    if (!streamType) return;

    capturedUrls.add(absUrl);

    // Extract title from filename or page title
    let title = customTitle || '';
    if (!title) {
      try {
        const pathPart = new URL(absUrl).pathname.split('/').pop() || '';
        title = decodeURIComponent(pathPart).replace(/\\.[^/.]+$/, '');
      } catch {
        title = document.title || 'Captured Media Stream';
      }
    }
    if (!title || title.length < 2) {
      title = document.title || 'Captured Media Stream';
    }

    try {
      window.parent.postMessage({
        type: 'MEDIADECK_SNIFFED_MEDIA',
        payload: {
          id: Math.random().toString(36).substring(2, 10),
          url: absUrl,
          title: title.trim(),
          type: streamType,
          mimeType: mimeType || undefined,
          sourcePageUrl: window.location.href,
          timestamp: Date.now(),
        }
      }, '*');
    } catch (err) {
      // ignore
    }
  }

  const adKeywords = [
    'doubleclick', 'googleadservices', 'googlesyndication', 'adnxs',
    'adsterra', 'propeller', 'popads', 'popcash', 'exoclick',
    'trafficjunky', 'outbrain', 'taboola', 'mgid', 'criteo',
    'bet365', '1xbet', 'exosrv', 'tsyndicate', 'popunder', 'clickadu',
    'yllix', 'adcash', 'infolinks', 'admaven', 'monetag'
  ];

  function isClientAdUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    for (const kw of adKeywords) {
      if (lower.includes(kw)) return true;
    }
    if (/(popunder|pop_under|banner[-_]ad|ad[-_]delivery|adsbygoogle)/i.test(lower)) {
      return true;
    }
    return false;
  }

  function createDummyWindow() {
    return {
      focus: function() {},
      blur: function() {},
      close: function() {},
      closed: false,
      location: { href: '', replace: function() {}, reload: function() {} },
      document: { write: function() {}, open: function() {}, close: function() {}, createElement: function() { return {}; } },
      postMessage: function() {},
      addEventListener: function() {},
      removeEventListener: function() {}
    };
  }

  // 1. Intercept window.open: filter ads, open legitimate pages in in-app tabs
  window.open = function(url, target, features) {
    if (!url || url === 'about:blank') {
      return createDummyWindow();
    }

    const absUrl = resolveAbsoluteUrl(url);

    // If ad blocking is active and URL matches an ad, block it!
    if (adBlockEnabled && isClientAdUrl(absUrl)) {
      console.info('[MediaDeck Sniffer] Blocked ad popunder window.open:', absUrl);
      try {
        window.parent.postMessage({ type: 'MEDIADECK_BLOCKED_AD', url: absUrl }, '*');
      } catch {}
      return createDummyWindow();
    }

    // Legitimate download page or popup: open as a new tab inside MediaDeck in-app browser!
    console.info('[MediaDeck Sniffer] Opening in new tab inside in-app browser:', absUrl);
    try {
      window.parent.postMessage({
        type: 'MEDIADECK_OPEN_TAB',
        url: absUrl,
        title: 'New Tab',
      }, '*');
    } catch {}

    return createDummyWindow();
  };

  // 1.1 Intercept history.replaceState & history.pushState to prevent obfuscation
  // (e.g., sportverse.cc replacing URL with /bgmi/) from breaking proxied navigation.
  const originalReplaceState = history.replaceState;
  const originalPushState = history.pushState;
  history.replaceState = function(state, title, url) {
    if (url && typeof url === 'string' && url.startsWith('/') && !url.includes('/api/browser/proxy')) {
      return;
    }
    return originalReplaceState.apply(this, arguments);
  };
  history.pushState = function(state, title, url) {
    if (url && typeof url === 'string' && url.startsWith('/') && !url.includes('/api/browser/proxy')) {
      return;
    }
    return originalPushState.apply(this, arguments);
  };

  // 2. Intercept window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function(input, init) {
    let requestUrl = '';
    if (typeof input === 'string') requestUrl = input;
    else if (input && input.url) requestUrl = input.url;

    if (requestUrl) {
      const preliminaryType = inferType(requestUrl);
      if (preliminaryType) {
        reportMedia(requestUrl);
      }
      const proxiedUrl = toProxyUrl(requestUrl);
      if (typeof input === 'string') {
        input = proxiedUrl;
      } else if (input && typeof Request !== 'undefined' && input instanceof Request) {
        try {
          input = new Request(proxiedUrl, input);
        } catch {}
      }
    }

    try {
      const response = await originalFetch.apply(this, [input, init]);
      if (response && response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('video/') || contentType.includes('mpegurl') || contentType.includes('dash+xml')) {
          reportMedia(response.url || requestUrl, contentType);
        }
      }
      return response;
    } catch (err) {
      throw err;
    }
  };

  // 3. Intercept XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__mediadeck_url = url;
    if (url && typeof url === 'string') {
      const preliminaryType = inferType(url);
      if (preliminaryType) {
        reportMedia(url);
      }
      url = toProxyUrl(url);
    }
    return originalXhrOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', () => {
      try {
        const ct = this.getResponseHeader('content-type') || '';
        if (ct.includes('video/') || ct.includes('mpegurl') || ct.includes('dash+xml')) {
          reportMedia(this.responseURL || this.__mediadeck_url, ct);
        }
      } catch {}
    });
    return originalXhrSend.apply(this, args);
  };

  // 4. Intercept <video> and <audio> elements
  function checkMediaElement(el) {
    if (!el) return;
    if (el.src) reportMedia(el.src);
    if (el.currentSrc) reportMedia(el.currentSrc);

    // Check child <source> elements
    const sources = el.querySelectorAll('source');
    sources.forEach(srcEl => {
      if (srcEl.src) {
        reportMedia(srcEl.src, srcEl.type);
      }
    });
  }

  // Scan existing media tags
  document.querySelectorAll('video, audio').forEach(checkMediaElement);

  // Monitor DOM for new media elements
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        const tagName = node.tagName.toLowerCase();
        if (tagName === 'video' || tagName === 'audio') {
          checkMediaElement(node);
        } else if (tagName === 'source') {
          if (node.src) reportMedia(node.src, node.type);
        } else if (node.querySelectorAll) {
          node.querySelectorAll('video, audio').forEach(checkMediaElement);
          node.querySelectorAll('source').forEach(s => {
            if (s.src) reportMedia(s.src, s.type);
          });
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  function unwrapRealUrl(el) {
    let u = el.getAttribute('data-original-url') || el.href || '';
    if (u.includes('/api/browser/proxy?url=')) {
      try {
        const parsed = new URL(u, window.location.origin);
        u = parsed.searchParams.get('url') || u;
      } catch {}
    }
    return u;
  }

  function checkIsMediaLink(el, u) {
    if (!u) return false;
    const clean = (u.split('?')[0] || '').toLowerCase();
    const dlAttr = (el.getAttribute('download') || '').toLowerCase();

    // Direct video/audio extension match in URL
    if (/\.(mp4|mkv|webm|avi|flv|mov|m4v|m3u8|mpd|mp3|wav|ogg|aac|flac)$/i.test(clean)) return true;
    // Download attribute has media extension
    if (/\.(mp4|mkv|webm|avi|flv|mov|m4v|mp3)$/i.test(dlAttr)) return true;
    // Direct storage/cloud server hosting media
    if (/r2\.cloudflarestorage\.com|pixeldrain\.(dev|com)|gpdl\d*\.hubcloud/i.test(u)) return true;
    // Explicit download attribute
    if (el.hasAttribute('download') && dlAttr.length > 0) return true;

    return false;
  }

  // 5. Intercept download and video link clicks + target=_blank new tabs
  document.addEventListener('click', (e) => {
    let target = e.target;
    while (target && target.tagName !== 'A') {
      target = target.parentElement;
    }
    if (!target || !target.href) return;

    const rawUrl = unwrapRealUrl(target);

    // If this is a downloadable media stream link, intercept and prevent native file download!
    if (checkIsMediaLink(target, rawUrl)) {
      e.preventDefault();
      e.stopPropagation();

      const type = inferType(rawUrl) || 'mp4';
      let title = target.getAttribute('download') || target.innerText?.trim() || '';
      if (!title || title.toLowerCase().includes('download')) {
        try {
          const pathPart = new URL(rawUrl).pathname.split('/').pop() || '';
          title = decodeURIComponent(pathPart).replace(/\.[^/.]+$/, '') || title;
        } catch {}
      }
      if (!title) {
        title = document.title || 'Captured Media Stream';
      }

      // Report to 1DM sniffer drawer
      reportMedia(rawUrl, undefined, title);

      // Post high-priority DOWNLOAD_CLICKED message to parent
      try {
        window.parent.postMessage({
          type: 'MEDIADECK_DOWNLOAD_CLICKED',
          payload: {
            url: rawUrl,
            title: title.substring(0, 80),
            type: type,
          }
        }, '*');
      } catch {}
      return;
    }

    // Check if non-media link was intended to open in a new tab
    const isBlank =
      target.target === '_blank' ||
      target.getAttribute('data-mediadeck-newtab') === 'true' ||
      e.ctrlKey ||
      e.metaKey;

    if (isBlank) {
      if (rawUrl && !rawUrl.startsWith('javascript:') && !rawUrl.startsWith('#')) {
        e.preventDefault();
        e.stopPropagation();

        // If adblock is active and link is an ad, block it
        if (adBlockEnabled && isClientAdUrl(rawUrl)) {
          try {
            window.parent.postMessage({ type: 'MEDIADECK_BLOCKED_AD', url: rawUrl }, '*');
          } catch {}
          return;
        }

        const linkTitle = target.innerText?.trim() || target.title || 'New Tab';
        window.parent.postMessage({
          type: 'MEDIADECK_OPEN_TAB',
          url: rawUrl,
          title: linkTitle.substring(0, 30),
        }, '*');
      }
    }
  }, true);

  // Also support middle-click (button === 1) to open in new tab
  document.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    let target = e.target;
    while (target && target.tagName !== 'A') {
      target = target.parentElement;
    }
    if (!target || !target.href) return;

    const rawUrl = unwrapRealUrl(target);

    if (checkIsMediaLink(target, rawUrl)) {
      e.preventDefault();
      e.stopPropagation();
      const type = inferType(rawUrl) || 'mp4';
      let title = target.getAttribute('download') || target.innerText?.trim() || '';
      reportMedia(rawUrl, undefined, title);
      try {
        window.parent.postMessage({
          type: 'MEDIADECK_DOWNLOAD_CLICKED',
          payload: { url: rawUrl, title: title.substring(0, 80), type: type }
        }, '*');
      } catch {}
      return;
    }

    if (rawUrl && !rawUrl.startsWith('javascript:') && !rawUrl.startsWith('#')) {
      e.preventDefault();
      e.stopPropagation();

      if (adBlockEnabled && isClientAdUrl(rawUrl)) {
        try {
          window.parent.postMessage({ type: 'MEDIADECK_BLOCKED_AD', url: rawUrl }, '*');
        } catch {}
        return;
      }

      const linkTitle = target.innerText?.trim() || target.title || 'New Tab';
      window.parent.postMessage({
        type: 'MEDIADECK_OPEN_TAB',
        url: rawUrl,
        title: linkTitle.substring(0, 30),
      }, '*');
    }
  }, true);

  // 6. Universal Form Submit Button Guardian
  document.addEventListener('click', (e) => {
    let btn = e.target;
    while (btn && btn.tagName !== 'BUTTON' && btn.tagName !== 'INPUT' && !btn.classList?.contains('btn')) {
      btn = btn.parentElement;
    }
    if (!btn) return;

    const btnType = (btn.getAttribute('type') || btn.type || '').toLowerCase();
    const btnText = (btn.innerText || btn.value || '').toLowerCase();
    const isSubmitBtn =
      btnType === 'submit' ||
      (btn.tagName === 'BUTTON' && !btnType) ||
      /unlock|generate|submit|download|proceed|verify/i.test(btnText);

    if (isSubmitBtn) {
      let form = btn.form;
      if (!form && btn.getAttribute('form')) {
        form = document.getElementById(btn.getAttribute('form'));
      }
      if (!form) {
        const forms = Array.from(document.querySelectorAll('form'));
        if (forms.length > 0) {
          let candidateForm = forms[forms.length - 1];
          for (let i = forms.length - 1; i >= 0; i--) {
            const f = forms[i];
            if (f.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) {
              candidateForm = f;
              break;
            }
          }
          if (candidateForm) {
            console.info('[MediaDeck Sniffer] Submitting associated form for orphaned button:', btn);
            e.preventDefault();
            e.stopPropagation();
            if (typeof candidateForm.requestSubmit === 'function') {
              candidateForm.requestSubmit(btn);
            } else {
              candidateForm.submit();
            }
          }
        }
      }
    }
  }, true);

  console.info('[MediaDeck Sniffer] Media sniffer initialized. AdBlock:', adBlockEnabled ? 'Active' : 'Disabled');
})();
  `;
}
