function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function metaContent(html, property) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<meta\\s+[^>]*property=["']${escapedProperty}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    'i',
  );
  return html.match(regex)?.[1] ?? null;
}

function isCubeCobraUrl(value) {
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

function parseCubeCobraMetadata(html) {
  const rawTitle = metaContent(html, 'og:title');
  const rawImage = metaContent(html, 'og:image');

  const name = rawTitle ? decodeHtmlEntities(rawTitle).replace(/^Cube Cobra:\s*/i, '').trim() : '';
  const imageUrl = rawImage ? decodeHtmlEntities(rawImage).trim() : '';

  if (!name || !imageUrl) {
    throw new Error('Could not find Cube Cobra name and image metadata.');
  }

  return { name, imageUrl };
}

export default async function handler(req, res, dependencies = {}) {
  const fetchPage = dependencies.fetch ?? fetch;
  const cubeUrl = typeof req.query?.url === 'string' ? req.query.url.trim() : '';

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  if (!isCubeCobraUrl(cubeUrl)) {
    return res.status(400).json({ error: 'Enter a valid Cube Cobra cube URL.' });
  }

  try {
    const response = await fetchPage(cubeUrl);
    if (!response.ok) throw new Error(`Cube Cobra returned ${response.status}`);

    return res.status(200).json(parseCubeCobraMetadata(await response.text()));
  } catch (err) {
    console.error('Failed to read Cube Cobra metadata:', err);
    return res.status(502).json({ error: 'Could not read Cube Cobra metadata.' });
  }
}

