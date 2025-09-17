import { createFileRoute } from "@tanstack/react-router";
import { FolderPlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { compareSemverDesc } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";

export const Route = createFileRoute("/versions")({
	component: RouteComponent,
});

function VersionRow({ version }: { version: string }) {
	const { openDialog } = useDialogStore();
	return (
		<div className="flex items-center gap-2 border-b border-b-muted py-2 px-2">
			<span className="flex-1">{version}</span>
			<div className="inline-flex -space-x-px rounded-md shadow-xs rtl:space-x-reverse">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Delete"
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => openDialog("DeleteVersionDialog", { version })}
							size="icon"
							variant="outline"
						>
							<XIcon aria-hidden="true" className="opacity-60" size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Delete</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}

function RouteComponent() {
	const { data: versions } = useInstalledVersions();
	const { openDialog } = useDialogStore();

	return (
		<div className="flex flex-col gap-2 w-full">
			<div className="flex gap-2 h-fit sticky top-0 bg-background/10 backdrop-blur-md z-10 px-4 py-2">
				<Button
					className="w-full justify-between cursor-pointer"
					onClick={() => openDialog("AddVersionDialog")}
					variant="outline"
				>
					<span className="flex text-xs">Add version</span>
					<FolderPlusIcon className="size-4" />
				</Button>
			</div>
			<div className="rounded shadow divide-y">
				{versions.sort(compareSemverDesc).map((version) => (
					<VersionRow key={version} version={version} />
				))}
			</div>
		</div>
	);
}
