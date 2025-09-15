import { UnplugIcon } from "lucide-react";
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
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import type { PublicServer } from "@/hooks/use-public-servers";
import { useInstallations } from "@/stores/installations";
import { PasswordInput } from "../inputs";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../ui/select";

export function ConnectServerDialog({ server }: { server: PublicServer }) {
	const [open, setOpen] = useState(false);
	const [password, setPassword] = useState("");
	const { installations } = useInstallations();
	const { mutate: connectToServer } = useConnectToServer();
	const [selectedInstallation, setSelectedInstallation] = useState<
		number | null
	>(null);

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger asChild>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Delete"
							className="shadow-none focus-visible:z-10"
							disabled={
								installations.filter((i) => i.version === server.gameVersion)
									.length === 0
							}
							onClick={() => setOpen(true)}
							size="icon"
							variant="outline"
						>
							<UnplugIcon aria-hidden="true" className="opacity-60" size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Connect to {server?.serverIP}</TooltipContent>
				</Tooltip>
			</AlertDialogTrigger>
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
						onClick={() => {
							if (selectedInstallation === null) return;
							connectToServer({
								installationId: selectedInstallation,
								ip: server.serverIP,
								password,
							});
							setOpen(false);
						}}
					>
						Connect
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
