import { WorldItem } from "../items/world.item";

export function WorldList({ worlds }: { worlds: [string, string][] }) {
	return (
		<div className="flex flex-col overflow-y-auto h-full relative">
			{worlds.map((world) => (
				<WorldItem key={world[0] + world[1]} world={world} />
			))}
		</div>
	);
}
