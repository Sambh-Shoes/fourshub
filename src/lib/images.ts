/** Shopify serves resized copies of a picture when asked with ?width=. Small ones keep the till fast. */
export function thumb(url: string | null | undefined, width = 120): string | null {
  if (!url) return null;
  return `${url}${url.includes("?") ? "&" : "?"}width=${width}`;
}
