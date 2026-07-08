import { describe, expect, it } from 'vitest';
import { isCubeCobraUrl, parseCubeCobraMetadata } from '../cubecobraMetadata';

describe('Cube Cobra metadata helpers', () => {
  it('accepts Cube Cobra cube URLs', () => {
    expect(isCubeCobraUrl('https://cubecobra.com/cube/about/100-ravagers')).toBe(true);
    expect(isCubeCobraUrl('https://cubecobra.com/cube/list/100-ravagers')).toBe(true);
  });

  it('rejects non-Cube Cobra URLs', () => {
    expect(isCubeCobraUrl('https://example.com/cube/about/100-ravagers')).toBe(false);
    expect(isCubeCobraUrl('not a url')).toBe(false);
  });

  it('extracts cube name and image URL from Open Graph metadata', () => {
    const html = `
      <meta property="og:title" content="Cube Cobra: 100 Ravagers">
      <meta property="og:image" content="https://assets.cubecobra.com/cardimages/ravager/art_crop.webp">
    `;

    expect(parseCubeCobraMetadata(html)).toEqual({
      name: '100 Ravagers',
      imageUrl: 'https://assets.cubecobra.com/cardimages/ravager/art_crop.webp',
    });
  });
});
