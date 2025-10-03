import { createFileRoute } from "@tanstack/react-router";
import { FolderPlusIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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

const itemVariants = {
	exit: { opacity: 0, transition: { duration: 0.15 }, y: -4 },
	hidden: { opacity: 0, y: 8 },
	show: (i: number) => ({
		opacity: 1,
		transition: {
			damping: 32,
			delay: i * 0.05, // 50ms incremental stagger based on current index
			stiffness: 420,
			type: "spring" as const,
		},
		y: 0,
	}),
};

function VersionRow({
	version,
	index = 0,
}: {
	version: string;
	index?: number;
}) {
	const { openDialog } = useDialogStore();
	return (
		<motion.div
			animate="show"
			className="flex items-center gap-2 border-b border-b-muted py-2 px-2"
			custom={index}
			exit="exit"
			initial="hidden"
			layout="position"
			variants={itemVariants}
		>
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
		</motion.div>
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
				<AnimatePresence>
					{[...versions].sort(compareSemverDesc).map((version, i) => (
						<VersionRow index={i} key={version} version={version} />
					))}
				</AnimatePresence>
			</div>
		</div>
	);
}
