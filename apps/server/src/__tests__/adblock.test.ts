import { describe, it, expect } from 'vitest';
import { isAdUrl, cleanAdHtml } from '../security/adblock.js';

describe('Ad Blocker Engine', () => {
  it('identifies known ad and tracking domains', () => {
    expect(isAdUrl('https://adservice.google.com/pagead/conversion/123')).toBe(true);
    expect(isAdUrl('https://securepubads.g.doubleclick.net/gampad/ads')).toBe(true);
    expect(isAdUrl('https://syndication.exoclick.com/splash.php')).toBe(true);
    expect(isAdUrl('https://serve.popads.net/serve.js')).toBe(true);
    expect(isAdUrl('https://cdn.adsterra.com/tag.js')).toBe(true);
    expect(isAdUrl('https://example.com/banner-ad/track')).toBe(true);
    expect(isAdUrl('https://example.com/popunder/click')).toBe(true);
  });

  it('allows clean non-ad media and content domains', () => {
    expect(isAdUrl('https://archive.org/details/movies')).toBe(false);
    expect(isAdUrl('https://commondatastorage.googleapis.com/videos/sample.mp4')).toBe(false);
    expect(isAdUrl('https://test-videos.co.uk/vids/bigbuckbunny.mp4')).toBe(false);
    expect(isAdUrl('https://drive.google.com/file/d/123/view')).toBe(false);
  });

  it('strips ad scripts and ad elements from HTML', () => {
    const dirtyHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Download Video Page</title>
          <script src="https://serve.popads.net/serve.js"></script>
          <script>
            (adsbygoogle = window.adsbygoogle || []).push({});
          </script>
        </head>
        <body>
          <div class="main-content">
            <h1>Movie Title</h1>
            <a href="https://example.com/download.mp4">Download MP4</a>
          </div>
          <div class="adsbygoogle" style="height:250px"></div>
          <iframe src="https://syndication.exoclick.com/ad.php"></iframe>
        </body>
      </html>
    `;

    const { cleanedHtml, blockedCount } = cleanAdHtml(dirtyHtml);

    expect(blockedCount).toBeGreaterThanOrEqual(3);
    expect(cleanedHtml).not.toContain('serve.popads.net');
    expect(cleanedHtml).not.toContain('exoclick.com');
    expect(cleanedHtml).toContain('Movie Title');
    expect(cleanedHtml).toContain('https://example.com/download.mp4');
  });
});
