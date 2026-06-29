import { create } from "zustand";

export type DownloadStatus = "pending" | "downloading" | "paused" | "extracting" | "done" | "error";

export interface DownloadEntry {
  token: string;
  label: string;
  status: DownloadStatus;
  bytesDownloaded: number;
  totalBytes: number | null;
  percent: number | null;
  speedBps: number | null;
  error: string | null;
}

interface DownloadState {
  entries: Record<string, DownloadEntry>;
}

interface DownloadActions {
  addEntry: (entry: Pick<DownloadEntry, "token" | "label" | "status">) => void;
  updateEntry: (token: string, updates: Partial<DownloadEntry>) => void;
  removeEntry: (token: string) => void;
}

export const useDownloadStore = create<DownloadState & DownloadActions>((set) => ({
  entries: {},

  addEntry: (entry) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [entry.token]: {
          token: entry.token,
          label: entry.label,
          status: entry.status,
          bytesDownloaded: 0,
          totalBytes: null,
          percent: null,
          speedBps: null,
          error: null,
        },
      },
    })),

  updateEntry: (token, updates) =>
    set((state) => {
      const existing = state.entries[token];
      if (!existing) return state;
      return {
        entries: {
          ...state.entries,
          [token]: { ...existing, ...updates },
        },
      };
    }),

  removeEntry: (token) =>
    set((state) => {
      const { [token]: _, ...rest } = state.entries;
      return { entries: rest };
    }),
}));
