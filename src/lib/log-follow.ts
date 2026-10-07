import type { LogChunk } from "@/lib/types";

/** The log contents the viewer currently holds. */
export interface LogSnapshot {
  text: string;
  path: string | null;
  /** Byte offset in the file where `text` ends. */
  offset: number;
  truncated: boolean;
}

/**
 * Fold a follow-mode chunk into the buffer. A reset chunk — a changed path or
 * a recreated file — replaces the buffer instead of appending.
 */
export function applyLogChunk(state: LogSnapshot | null, chunk: LogChunk): LogSnapshot {
  if (!state || chunk.reset) {
    return {
      text: chunk.text,
      path: chunk.path,
      offset: chunk.offset,
      truncated: chunk.truncated,
    };
  }
  return {
    text: state.text + chunk.text,
    path: chunk.path,
    offset: chunk.offset,
    truncated: state.truncated,
  };
}

export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/** Whether a scroll position counts as pinned to the newest content. */
export function isNearBottom(metrics: ScrollMetrics, threshold = 48): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
}
