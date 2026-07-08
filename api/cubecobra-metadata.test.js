import { describe, expect, it, vi } from 'vitest';
import handler from './cubecobra-metadata.js';

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('Cube Cobra metadata API', () => {
  it('returns parsed metadata for a Cube Cobra URL', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => `
        <meta property="og:title" content="Cube Cobra: 100 Ravagers">
        <meta property="og:image" content="https://assets.cubecobra.com/cardimages/ravager/art_crop.webp">
      `,
    }));
    const res = createResponse();

    await handler(
      { query: { url: 'https://cubecobra.com/cube/about/100-ravagers' } },
      res,
      { fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://cubecobra.com/cube/about/100-ravagers');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      name: '100 Ravagers',
      imageUrl: 'https://assets.cubecobra.com/cardimages/ravager/art_crop.webp',
    });
  });

  it('rejects non-Cube Cobra URLs', async () => {
    const fetchMock = vi.fn();
    const res = createResponse();

    await handler({ query: { url: 'https://example.com/cube/about/100-ravagers' } }, res, { fetch: fetchMock });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Enter a valid Cube Cobra cube URL.');
  });

  it('returns an error when metadata cannot be found', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '<html></html>',
    }));
    const res = createResponse();

    await handler({ query: { url: 'https://cubecobra.com/cube/about/100-ravagers' } }, res, { fetch: fetchMock });

    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe('Could not read Cube Cobra metadata.');
  });
});
