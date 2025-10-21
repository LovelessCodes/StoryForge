import { create } from "zustand";
import type { AddInstallationDialogProps } from "@/components/dialogs/addinstallation.dialog";
import type { AddModDialogProps } from "@/components/dialogs/addmod.dialog";
import type { AddServerDialogProps } from "@/components/dialogs/addserver.dialog";
import type { ConnectServerDialogProps } from "@/components/dialogs/connectserver.dialog";
import type { DeleteInstallationDialogProps } from "@/components/dialogs/deleteinstallation.dialog";
import type { DeleteServerDialogProps } from "@/components/dialogs/deleteserver.dialog";
import type { DeleteVersionDialogProps } from "@/components/dialogs/deleteversion.dialog";
import type { DeleteWorldDialogProps } from "@/components/dialogs/deleteworld.dialog";
import type { EditInstallationDialogProps } from "@/components/dialogs/editinstallation.dialog";
import type { EditServerDialogProps } from "@/components/dialogs/editserver.dialog";
import type { EditWorldDialogProps } from "@/components/dialogs/editworld.dialog";
import type { RemoveModDialogProps } from "@/components/dialogs/removemod.dialog";
import type { UpdateModDialogProps } from "@/components/dialogs/updatemod.dialog";
import type { ViewMapDialogProps } from "@/components/dialogs/viewmap.dialog";

export type DialogMap = {
	AddInstallationDialog: AddInstallationDialogProps;
	AddModDialog: AddModDialogProps;
	AddServerDialog: AddServerDialogProps;
	AddUserDialog: undefined;
	AddVersionDialog: undefined;
	ConnectServerDialog: ConnectServerDialogProps;
	DeleteInstallationDialog: DeleteInstallationDialogProps;
	DeleteServerDialog: DeleteServerDialogProps;
	DeleteVersionDialog: DeleteVersionDialogProps;
	EditInstallationDialog: EditInstallationDialogProps;
	EditServerDialog: EditServerDialogProps;
	ImportInstallationDialog: undefined;
	RemoveModDialog: RemoveModDialogProps;
	UpdateModDialog: UpdateModDialogProps;
	EditWorldDialog: EditWorldDialogProps;
	DeleteWorldDialog: DeleteWorldDialogProps;
	ViewMapDialog: ViewMapDialogProps;
};

type DialogKey = keyof DialogMap;

type AnyDialogPayload = {
	[K in DialogKey]: { key: K; props: DialogMap[K] };
}[DialogKey];

type DialogState = AnyDialogPayload | null;

type DialogStoreValue = {
	openDialog: <K extends DialogKey>(key: K, props?: DialogMap[K]) => void;
	closeDialog: () => void;
	active: DialogState;
};

export const useDialogStore = create<DialogStoreValue>((set) => ({
	active: null,
	closeDialog: () => set(() => ({ active: null })),
	openDialog: (key, props) =>
		set(() => ({ active: { key, props } as AnyDialogPayload })),
}));
