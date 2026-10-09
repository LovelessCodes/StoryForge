import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { errorMessage } from "@/lib/errors";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";

export type User = {
  uid: string | undefined;
  email: string;
  playername: string | undefined;
  sessionkey: string | undefined;
  sessionsignature: string | undefined;
  selected: boolean;
};

type AccountStore = {
  selectedUser: User | null;
  users: User[];
  loadAccounts: () => Promise<void>;
  saveAccounts: () => Promise<void>;
  addUser: (user: Omit<User, "selected">) => void;
  removeUser: (uid: string | undefined) => void;
  removeAllExcept: (uid: string | undefined) => void;
  removeAll: () => void;
  setSelectedUser: (uid: string | undefined) => void;
};

export const useAccountStore = create<AccountStore>((set, get) => ({
  addUser: (user) => {
    const newUser: User = { ...user, selected: true };
    set((state) => ({
      selectedUser: newUser,
      users: [...state.users.map((u) => ({ ...u, selected: false })), newUser],
    }));
    void get().saveAccounts();
  },
  loadAccounts: async () => {
    try {
      const saved = await invoke<User[]>("load_accounts");
      if (saved.length > 0) {
        const selected = saved.find((u) => u.selected) ?? saved[0];
        set({ users: saved, selectedUser: selected });
      }
    } catch (e) {
      console.error("Failed to load accounts:", e);
    }
  },
  removeAll: () => {
    set({ selectedUser: null, users: [] });
    void get().saveAccounts();
  },
  removeAllExcept: (uid) => {
    set((state) => {
      const remaining = state.users.filter((user) => user.uid === uid);
      // Keep the current selection only if it survives the filter; otherwise
      // fall back to a user from the remaining list.
      const selectedUid = state.selectedUser?.uid;
      const stillSelected =
        selectedUid === undefined ? undefined : remaining.find((user) => user.uid === selectedUid);
      return { selectedUser: stillSelected ?? remaining[0] ?? null, users: remaining };
    });
    void get().saveAccounts();
  },
  removeUser: (uid) => {
    set((state) => {
      const remaining = state.users.filter((user) => user.uid !== uid);
      // The selection must come from the remaining list: picking from the
      // unfiltered one could re-select the user that was just removed.
      return {
        selectedUser: state.selectedUser?.uid === uid ? (remaining[0] ?? null) : state.selectedUser,
        users: remaining,
      };
    });
    void get().saveAccounts();
  },
  saveAccounts: async () => {
    try {
      const { users, selectedUser } = get();
      const accounts = users.map((u) => ({
        ...u,
        selected: selectedUser?.uid === u.uid,
      }));
      await invoke("save_accounts", { accounts });
    } catch (e) {
      console.error("Failed to save accounts:", e);
      toast.error(t("auth.errors.unexpected"), { description: errorMessage(e) });
    }
  },
  selectedUser: null,
  setSelectedUser: (uid) => {
    set((state) => ({
      selectedUser: state.users.find((u) => u.uid === uid) || state.selectedUser,
    }));
    void get().saveAccounts();
  },
  users: [],
}));
