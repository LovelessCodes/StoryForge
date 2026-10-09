export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/** Whether a scroll position counts as pinned to the newest content. */
export function isNearBottom(metrics: ScrollMetrics, threshold = 48): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
}
