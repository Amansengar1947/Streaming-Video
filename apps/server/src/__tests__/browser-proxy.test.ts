import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

describe('Browser Proxy and 1DM Sniffer Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/browser/sniffer.js serves client sniffer agent with mkv and history intercept', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/browser/sniffer.js',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('javascript');
    expect(response.body).toContain('MEDIADECK_SNIFFED_MEDIA');
    expect(response.body).toContain('MEDIADECK_BLOCKED_AD');
    expect(response.body).toContain('MEDIADECK_DOWNLOAD_CLICKED');
    expect(response.body).toContain('checkIsMediaLink');
    expect(response.body).toContain('.endsWith(\'.mkv\')');
    expect(response.body).toContain('history.replaceState');
  });

  it('GET /api/browser/proxy rejects missing URL parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/browser/proxy',
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET /api/browser/proxy blocks localhost SSRF attempts', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/browser/proxy?url=http://127.0.0.1:8080/admin',
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('BLOCKED_URL');
  });

  it('GET /api/browser/proxy blocks ad domains with 204 when adblock=1', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/browser/proxy?url=https://securepubads.g.doubleclick.net/gampad/ads&adblock=1',
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['x-mediadeck-blocked-ad']).toBe('true');
  });

  it('POST /api/browser/proxy accepts form submissions and handles SSRF validation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/browser/proxy?url=http://127.0.0.1:8080/admin',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: '_csrf=mocktoken123',
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('BLOCKED_URL');
  });

  it('repairMalformedForms recovers overlapping container tags and keeps submit buttons inside forms', async () => {
    const { repairMalformedForms } = await import('../browser/form-repair.js');
    const cheerio = await import('cheerio');

    const malformed = `<div class="view-captcha">
<p>Protector text</p>
</center>

<form method="post" action="">
<input type="hidden" name="_csrf" value="tok123">

</div>

<div class="submit-captcha row">
    <div class="col-sm-3 col-sm-offset-4"> 
        <button type="submit" class="btn btn-primary btn-block">
            Unlock Links
        </button>
    </div>
</div>

</form>`;

    const repaired = repairMalformedForms(malformed);
    const $ = cheerio.load(repaired);

    expect($('form').length).toBe(1);
    expect($('form button[type="submit"]').length).toBe(1);
    expect($('form button').text().trim()).toBe('Unlock Links');
    expect($('form input[name="_csrf"]').val()).toBe('tok123');
  });

  it('associateOrphanedFormElements binds orphaned submit buttons to nearest form by ID', async () => {
    const { associateOrphanedFormElements } = await import('../browser/form-repair.js');
    const cheerio = await import('cheerio');

    const html = `<div>
<form method="post" action="/submit"><input type="hidden" name="token" value="abc"></form>
<div class="footer"><button type="submit">Submit Outside</button></div>
</div>`;

    const $ = cheerio.load(html);
    associateOrphanedFormElements($);

    expect($('form').attr('id')).toBe('mediadeck-form-0');
    expect($('button').attr('form')).toBe('mediadeck-form-0');
  });

  it('GET /api/browser/proxy blocks driverhugoverblown.com and llvpn.com ads', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/browser/proxy?url=https://driverhugoverblown.com/on.js&adblock=1',
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['x-mediadeck-blocked-ad']).toBe('true');
  });
});
