import { AnimatePresence } from "motion/react";
import type { GameData } from "@/hooks/use-saves";
import { WorldItem } from "../items/world.item";

export function WorldList({
	worlds,
}: {
	worlds: [GameData, string, string][];
}) {
	return (
		<div className="flex flex-col overflow-y-auto h-full relative">
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
			</AnimatePresence>
		</div>
	);
}
