export interface CubeCobraMetadata {
  name: string;
  imageUrl: string;
}

function decodeHtmlEntities(value: string): string {
  if (typeof document === 'undefined') {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function metaContent(html: string, property: string): string | null {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<meta\\s+[^>]*property=["']${escapedProperty}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    'i',
  );
  return html.match(regex)?.[1] ?? null;
}

export function isCubeCobraUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.hostname === 'cubecobra.com' || url.hostname === 'www.cubecobra.com')
      && url.pathname.startsWith('/cube/')
    );
  } catch {
    return false;
  }
}

export function parseCubeCobraMetadata(html: string): CubeCobraMetadata {
  const rawTitle = metaContent(html, 'og:title');
  const rawImage = metaContent(html, 'og:image');

  const name = rawTitle ? decodeHtmlEntities(rawTitle).replace(/^Cube Cobra:\s*/i, '').trim() : '';
  const imageUrl = rawImage ? decodeHtmlEntities(rawImage).trim() : '';

  if (!name || !imageUrl) {
    throw new Error('Could not find Cube Cobra name and image metadata.');
  }

  return { name, imageUrl };
}
