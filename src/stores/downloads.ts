import { create } from "zustand";

export type DownloadStatus = "pending" | "downloading" | "paused" | "extracting" | "done" | "error";

export type DownloadKind = "version" | "mod";

export interface DownloadEntry {
  token: string;
  label: string;
  status: DownloadStatus;
  kind: DownloadKind;
  /** Secondary line for the sheet (destination profile / server). */
  detail: string | null;
  /** Request data, kept so a retry can run without the original caller. */
  url: string | null;
  destpath: string | null;
  /** Profile root whose mod lists are refreshed after the download. */
  modsDirectory: string | null;
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
  addEntry: (
    entry: Pick<DownloadEntry, "token" | "label" | "status"> & Partial<DownloadEntry>,
  ) => void;
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
          kind: "version",
          detail: null,
          url: null,
          destpath: null,
          modsDirectory: null,
          ...entry,
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
