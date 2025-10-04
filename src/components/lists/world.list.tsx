import { AnimatePresence } from "motion/react";
import { WorldItem } from "@/components/items/world.item";
import type { GameData } from "@/hooks/use-saves";

export function WorldList({
	worlds,
}: {
	worlds: [GameData, string, string][];
}) {
	return (
		<div className="flex flex-col w-full bg-card p-2 rounded shadow border relative overflow-y-auto">
			<AnimatePresence>
				{[...worlds]
					.sort((a, b) => {
						const aLastPlayed = a[0].last_played
							? new Date(a[0].last_played).getTime()
							: 0;
						const bLastPlayed = b[0].last_played
							? new Date(b[0].last_played).getTime()
							: 0;
						return bLastPlayed - aLastPlayed;
					})
					.map((world, i) => (
						<WorldItem
							index={i}
							key={world[0].world_name + world[1]}
							world={world}
						/>
					))}
				{worlds.length === 0 && (
					<p className="p-4 text-sm text-muted-foreground select-none">
						No worlds found yet. Create a world in-game to get started.
					</p>
				)}
			</AnimatePresence>
		</div>
	);
}
