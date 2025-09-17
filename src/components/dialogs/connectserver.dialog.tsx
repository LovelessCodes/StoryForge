import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import type { PublicServer } from "@/hooks/use-public-servers";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";
import { PasswordInput } from "../inputs";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../ui/select";

export type ConnectServerDialogProps = {
	server: PublicServer;
};

export function ConnectServerDialog({
	open,
	server,
}: {
	open: boolean;
} & ConnectServerDialogProps) {
	const [password, setPassword] = useState("");
	const { installations } = useInstallations();
	const { mutate: connectToServer } = useConnectToServer();
	const { closeDialog } = useDialogStore();
	const [selectedInstallation, setSelectedInstallation] = useState<
		number | null
	>(null);

	return (
		<AlertDialog onOpenChange={() => closeDialog()} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Pick an installation to connect to {server?.serverIP}
					</AlertDialogTitle>
					<AlertDialogDescription>
						This will open Vintage Story and connect to the server.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="flex flex-col gap-2 w-full">
					<Select
						onValueChange={(value) => setSelectedInstallation(Number(value))}
						value={selectedInstallation?.toString() || undefined}
					>
						<SelectTrigger className="w-full">
							{installations.find((i) => i.id === selectedInstallation)?.name ||
								"Select an installation"}
						</SelectTrigger>
						<SelectContent>
							{installations
								.filter((i) => i.version === server.gameVersion)
								.map((installation) => (
									<SelectItem
										key={installation.id}
										value={installation.id.toString()}
									>
										{installation.name}
									</SelectItem>
								))}
						</SelectContent>
					</Select>
					{server.hasPassword && (
						<PasswordInput
							className="mt-4"
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Server Password"
							value={password}
						/>
					)}
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={selectedInstallation === null}
						onClick={() => {
							if (selectedInstallation === null) return;
							connectToServer({
								installationId: selectedInstallation,
								ip: server.serverIP,
								password,
							});
							closeDialog();
						}}
					>
						Connect
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
