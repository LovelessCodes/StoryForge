import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export type User = {
  uid: string | undefined;
  email: string;
  playername: string | undefined;
  sessionkey: string | undefined;
  sessionsignature: string | undefined;
};

type AccountStore = {
  selectedUser: User | null;
  users: User[];
  loadAccounts: () => Promise<void>;
  saveAccounts: () => Promise<void>;
  addUser: (user: User) => void;
  removeUser: (uid: string | undefined) => void;
  removeAllExcept: (uid: string | undefined) => void;
  removeAll: () => void;
  setSelectedUser: (uid: string | undefined) => void;
};

export const useAccountStore = create<AccountStore>((set, get) => ({
  addUser: (user) =>
    set((state) => {
      const newState = {
        selectedUser: user,
        users: [...state.users, user],
      };
      get().saveAccounts();
      return newState;
    }),
  loadAccounts: async () => {
    try {
      const saved = await invoke<User[]>("load_accounts");
      if (saved.length > 0) {
        set({ users: saved, selectedUser: saved[0] });
      }
    } catch (e) {
      console.error("Failed to load accounts:", e);
    }
  },
  removeAll: () =>
    set(() => {
      get().saveAccounts();
      return { selectedUser: null, users: [] };
    }),
  removeAllExcept: (uid) =>
    set((state) => {
      const newState = {
        selectedUser:
          state.selectedUser?.uid === uid
            ? state.selectedUser
            : state.users.filter((user) => user.uid !== uid).length > 0
              ? state.users[0]
              : null,
        users: state.users.filter((user) => user.uid === uid),
      };
      get().saveAccounts();
      return newState;
    }),
  removeUser: (uid) =>
    set((state) => {
      const newState = {
        selectedUser:
          state.selectedUser?.uid === uid
            ? state.users.filter((user) => user.uid !== uid).length > 0
              ? state.users[0]
              : null
            : state.selectedUser,
        users: state.users.filter((user) => user.uid !== uid),
      };
      get().saveAccounts();
      return newState;
    }),
  saveAccounts: async () => {
    try {
      await invoke("save_accounts", { accounts: get().users });
    } catch (e) {
      console.error("Failed to save accounts:", e);
    }
  },
  selectedUser: null,
  setSelectedUser: (uid) =>
    set((state) => ({
      selectedUser: state.users.find((u) => u.uid === uid) || state.selectedUser,
    })),
  users: [],
}));
