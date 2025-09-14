import { createTauriStore } from "@tauri-store/zustand";
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
	addUser: (user: User) => void;
	removeUser: (uid: string | undefined) => void;
	removeAllExcept: (uid: string | undefined) => void;
	removeAll: () => void;
	setSelectedUser: (uid: string | undefined) => void;
};

export const useAccountStore = create<AccountStore>((set) => ({
	addUser: (user) =>
		set((state) => ({
			selectedUser: user,
			users: [...state.users, user],
		})),
	removeAll: () => set({ selectedUser: null, users: [] }),
	removeAllExcept: (uid) =>
		set((state) => ({
			selectedUser:
				state.selectedUser?.uid === uid
					? state.selectedUser
					: state.users.filter((user) => user.uid !== uid).length > 0
						? state.users[0]
						: null,
			users: state.users.filter((user) => user.uid === uid),
		})),
	removeUser: (uid) =>
		set((state) => ({
			selectedUser:
				state.selectedUser?.uid === uid
					? state.users.filter((user) => user.uid !== uid).length > 0
						? state.users[0]
						: null
					: state.selectedUser,
			users: state.users.filter((user) => user.uid !== uid),
		})),
	selectedUser: null,
	setSelectedUser: (uid) =>
		set((state) => ({
			selectedUser:
				state.users.find((u) => u.uid === uid) || state.selectedUser,
		})),
	users: [],
}));

export const tauriAccountsHandler = createTauriStore("accounts", useAccountStore, {
	saveOnChange: true,
});
