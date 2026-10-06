/** Binary-search a measured list. Overscan keeps images and adjacent date groups stable. */
export function messageWindow(heights: number[], top: number, viewportHeight: number, overscan = 900) {
  const offsets = [0];
  for (const height of heights) offsets.push(offsets[offsets.length - 1] + Math.max(1, height));
  const find = (value: number) => { let low = 0, high = heights.length; while (low < high) { const middle = (low + high) >>> 1; if (offsets[middle + 1] < value) low = middle + 1; else high = middle; } return low; };
  const start = Math.min(heights.length, find(Math.max(0, top - overscan)));
  const end = Math.min(heights.length, find(top + viewportHeight + overscan) + 1);
  return { start, end, before: offsets[start], after: offsets[heights.length] - offsets[end], total: offsets[heights.length] };
}
