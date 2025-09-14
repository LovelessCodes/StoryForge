import { createFileRoute } from "@tanstack/react-router";
import { AddVersionDialog } from "@/components/dialogs/addversion.dialog";
import { DeleteVersionDialog } from "@/components/dialogs/deleteversion.dialog";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { compareSemverDesc } from "@/lib/utils";

export const Route = createFileRoute("/versions")({
	component: RouteComponent,
});

function VersionRow({ version }: { version: string }) {
	return (
		<div className="flex items-center gap-2 border-b border-b-muted py-2 px-2">
			<span className="flex-1">{version}</span>
			<div className="inline-flex -space-x-px rounded-md shadow-xs rtl:space-x-reverse">
				<DeleteVersionDialog version={version} />
			</div>
		</div>
	);
}

function RouteComponent() {
	const { data: versions } = useInstalledVersions();

	return (
		<div className="flex flex-col gap-2 w-full">
			<div className="flex gap-2 h-fit sticky top-0 bg-background/10 backdrop-blur-md z-10 px-4 py-2">
				<AddVersionDialog />
			</div>
			<div className="rounded shadow divide-y">
				{versions.sort(compareSemverDesc).map((version) => (
					<VersionRow key={version} version={version} />
				))}
			</div>
		</div>
	);
}
