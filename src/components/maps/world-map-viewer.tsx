import {
	ArrowDownToDotIcon,
	Loader2Icon,
	MapIcon,
	SparkleIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import {
	imageDataToDataUrl,
	useAllMapTiles,
	useMapBounds,
} from "@/hooks/use-world-map";
import type {
	MapMarker,
	MapMarkers,
	ProspectingLog,
	ProspectingMarker,
	ProspectResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type WorldMapViewerProps = {
	worldPath: string;
	mapMarkers?: MapMarkers | null | undefined;
	prospectingLogs?: [string, ProspectingLog][];
};

export function WorldMapViewer({
	worldPath,
	mapMarkers,
	prospectingLogs,
}: WorldMapViewerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const {
		data: tiles,
		isLoading: tilesLoading,
		error: tilesError,
	} = useAllMapTiles(worldPath);
	const { data: bounds, isLoading: boundsLoading } = useMapBounds(worldPath);

	// Viewport state (x, y = top-left corner in world coords, zoom = scale factor)
	const [viewport, setViewport] = useState({
		x: 0,
		y: 0,
		zoom: 0.5,
	});

	// Pan state
	const [isPanning, setIsPanning] = useState(false);
	const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

	// Cursor coordinates state
	const [cursorCoords, setCursorCoords] = useState<{
		x: number;
		y: number;
		z?: number;
		screenX: number;
		screenY: number;
	} | null>(null);

	// Currently hovered prospecting marker
	const [prospectingMarker, setProspectingMarker] =
		useState<ProspectingMarker | null>(null);

	const sortByQuality = (a: ProspectResult, b: ProspectResult) => {
		const qualityA = a.readings?.quality ?? 0;
		const qualityB = b.readings?.quality ?? 0;
		return qualityB - qualityA;
	};

	// Cache loaded images
	const [imageCache, setImageCache] = useState<Map<string, HTMLImageElement>>(
		new Map(),
	);

	// Cache for marker icons
	const [iconCache, setIconCache] = useState<Map<string, HTMLImageElement>>(
		new Map(),
	);

	// Track container size for re-rendering on resize
	const [containerSize, setContainerSize] = useState({ height: 0, width: 0 });

	// Pre-calculate spawn offset (Vintage Story worlds spawn around block coordinate 512000)
	const SPAWN_COORDINATE = 512000;
	const MAP_CHUNK_SIZE = 32;
	const spawnOffsetX = bounds
		? Math.round((bounds.min_y * MAP_CHUNK_SIZE) / SPAWN_COORDINATE) *
			SPAWN_COORDINATE
		: 0;
	const spawnOffsetY = bounds
		? Math.round((bounds.min_x * MAP_CHUNK_SIZE) / SPAWN_COORDINATE) *
			SPAWN_COORDINATE
		: 0;

	// Observe container resize to trigger re-render
	useEffect(() => {
		if (!containerRef.current) return;

		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				setContainerSize({ height, width });
			}
		});

		resizeObserver.observe(containerRef.current);

		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	// Initialize viewport when bounds are loaded
	useEffect(() => {
		if (bounds && containerRef.current && tiles && tiles.length > 0) {
			// Calculate normalized extent (remember: X and Y are swapped for screen)
			const normalizedWidth = bounds.max_y - bounds.min_y + 1; // Y = horizontal
			const normalizedHeight = bounds.max_x - bounds.min_x + 1; // X = vertical

			// Get first tile to determine tile size
			const tileSize = tiles[0]?.width || 512;

			// Calculate actual pixel dimensions
			const mapPixelWidth = normalizedWidth * tileSize;
			const mapPixelHeight = normalizedHeight * tileSize;

			// Center the view
			const containerWidth = containerRef.current.clientWidth;
			const containerHeight = containerRef.current.clientHeight;

			// Calculate zoom to fit the entire map with padding
			const zoomX = containerWidth / mapPixelWidth;
			const zoomY = containerHeight / mapPixelHeight;
			const fitZoom = Math.min(zoomX, zoomY) * 0.9; // 90% for padding

			setViewport({
				x: normalizedWidth / 2 - containerWidth / (2 * tileSize * fitZoom),
				y: normalizedHeight / 2 - containerHeight / (2 * tileSize * fitZoom),
				zoom: fitZoom,
			});
		}
	}, [bounds, tiles]);

	// Load and cache images when tiles change
	useEffect(() => {
		if (!tiles) return;

		for (const tile of tiles) {
			const key = `${tile.x},${tile.y}`;
			if (!imageCache.has(key)) {
				const img = new Image();
				img.src = imageDataToDataUrl(tile.image_data);
				img.onload = () => {
					setImageCache((prev) => new Map(prev).set(key, img));
				};
			}
		}
	}, [tiles, imageCache]);

	// Load and cache marker icons
	useEffect(() => {
		if (!mapMarkers?.markers) return;

		const uniqueIcons = new Set(
			mapMarkers.markers.map((marker) => marker.icon).filter(Boolean),
		);

		for (const iconName of uniqueIcons) {
			if (!iconCache.has(iconName)) {
				const img = new Image();
				// Try to load the icon from assets
				// Using relative path that Vite will resolve
				img.src = `/src/assets/map-icons/${iconName}.svg`;
				img.onload = () => {
					setIconCache((prev) => new Map(prev).set(iconName, img));
				};
				img.onerror = () => {
					// Icon not found - mark as missing so we don't try again
					setIconCache((prev) => new Map(prev).set(iconName, new Image()));
				};
			}
		}
	}, [mapMarkers, iconCache]);

	// Render the map
	// biome-ignore lint/correctness/useExhaustiveDependencies: Needed for rendering on viewport change
	useEffect(() => {
		if (!canvasRef.current || !tiles || !containerRef.current) return;

		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// Set canvas size to match container
		const rect = containerRef.current.getBoundingClientRect();
		canvas.width = rect.width;
		canvas.height = rect.height;

		// Clear canvas
		ctx.fillStyle = "#1a1a1a";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Find min coordinates to normalize tile positions
		const minX = Math.min(...tiles.map((t) => t.x));
		const minY = Math.min(...tiles.map((t) => t.y));
		const tileSize = tiles[0]?.width || 512;

		// Draw tiles
		for (const tile of tiles) {
			const img = imageCache.get(`${tile.x},${tile.y}`);
			if (!img || !img.complete) continue;

			// Normalize coordinates relative to minimum
			const normalizedX = tile.x - minX;
			const normalizedY = tile.y - minY;

			// IMPORTANT: Swap X and Y for screen coordinates!
			// In Vintage Story's coordinate system:
			// - tile.x corresponds to vertical position (rows)
			// - tile.y corresponds to horizontal position (columns)
			const screenX =
				(normalizedY * tileSize - viewport.x * tileSize) * viewport.zoom;
			const screenY =
				(normalizedX * tileSize - viewport.y * tileSize) * viewport.zoom;
			const screenSize = tileSize * viewport.zoom;

			// Only draw if visible and large enough to matter
			if (
				screenX + screenSize > 0 &&
				screenX < canvas.width &&
				screenY + screenSize > 0 &&
				screenY < canvas.height &&
				screenSize >= 2 // Skip tiles smaller than 2px
			) {
				ctx.drawImage(img, screenX, screenY, screenSize, screenSize);
			}
		}

		// Draw map markers only if zoom is above threshold
		if (mapMarkers?.markers && viewport.zoom > 0.2) {
			let debugMarkerInfo = "";
			for (const marker of mapMarkers.markers) {
				if (!marker.position) continue;
				const mapChunkSize = 32;
				const markerTileX = Math.floor(marker.position.y / mapChunkSize);
				const markerTileY = Math.floor(marker.position.x / mapChunkSize);
				const offsetWithinTileX =
					(marker.position.y % mapChunkSize) / mapChunkSize;
				const offsetWithinTileY =
					(marker.position.x % mapChunkSize) / mapChunkSize;
				const normalizedX = markerTileX - minX;
				const normalizedY = markerTileY - minY;
				const screenX =
					((normalizedY + offsetWithinTileY) * tileSize -
						viewport.x * tileSize) *
					viewport.zoom;
				const screenY =
					((normalizedX + offsetWithinTileX) * tileSize -
						viewport.y * tileSize) *
					viewport.zoom;
				if (!debugMarkerInfo) {
					debugMarkerInfo = `M1: icon="${marker.icon}" label="${marker.label}"`;
				}
				if (
					screenX > -20 &&
					screenX < canvas.width + 20 &&
					screenY > -20 &&
					screenY < canvas.height + 20
				) {
					const baseSize = 16;
					const iconSize = Math.max(12, Math.min(32, baseSize * viewport.zoom));
					const icon = marker.icon ? iconCache.get(marker.icon) : null;
					let drawnSize = iconSize;
					if (icon?.complete && icon.naturalWidth > 0) {
						ctx.save();
						ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
						ctx.shadowBlur = 4;
						ctx.shadowOffsetX = 1;
						ctx.shadowOffsetY = 1;
						const tempCanvas = document.createElement("canvas");
						tempCanvas.width = iconSize;
						tempCanvas.height = iconSize;
						const tempCtx = tempCanvas.getContext("2d");
						if (tempCtx) {
							tempCtx.drawImage(icon, 0, 0, iconSize, iconSize);
							tempCtx.globalCompositeOperation = "source-in";
							tempCtx.fillStyle = `rgba(${(marker.color >> 16) & 0xff}, ${(marker.color >> 8) & 0xff}, ${marker.color & 0xff}, ${Math.min(Math.max(marker.opacity / 255, 0), 1)})`;
							tempCtx.fillRect(0, 0, iconSize, iconSize);
							ctx.drawImage(
								tempCanvas,
								screenX - iconSize / 2,
								screenY - iconSize / 2,
							);
						}
						ctx.restore();
					} else {
						const markerSize = Math.max(4, Math.min(10, 5 * viewport.zoom));
						drawnSize = markerSize;
						ctx.fillStyle = "#ff0000";
						ctx.strokeStyle = "#ffffff";
						ctx.lineWidth = 2;
						ctx.beginPath();
						ctx.arc(screenX, screenY, markerSize, 0, Math.PI * 2);
						ctx.fill();
						ctx.stroke();
					}
					if (viewport.zoom > 0.3 && marker.label) {
						const fontSize = Math.max(10, Math.min(14, 12 * viewport.zoom));
						ctx.font = `${fontSize}px sans-serif`;
						const textWidth = ctx.measureText(marker.label).width;
						ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
						ctx.fillRect(
							screenX + drawnSize / 2 + 4,
							screenY - fontSize / 2 - 2,
							textWidth + 8,
							fontSize + 4,
						);
						ctx.fillStyle = "#ffffff";
						ctx.fillText(
							marker.label,
							screenX + drawnSize / 2 + 8,
							screenY + fontSize / 2 - 2,
						);
					}
				}
			}
		}

		// Draw prospecting markers
		if (prospectingLogs) {
			for (const [_playerUid, log] of prospectingLogs) {
				for (const marker of log.markers) {
					if (!marker.position) continue;

					const mapChunkSize = 32;

					// Calculate which tile the marker is in
					const markerTileX = Math.floor(marker.position.y / mapChunkSize); // Swap: use Y for tileX
					const markerTileY = Math.floor(marker.position.x / mapChunkSize); // Swap: use X for tileY

					// Calculate position WITHIN the tile (0-1 range)
					const offsetWithinTileX =
						(marker.position.y % mapChunkSize) / mapChunkSize;
					const offsetWithinTileY =
						(marker.position.x % mapChunkSize) / mapChunkSize;

					const normalizedX = markerTileX - minX;
					const normalizedY = markerTileY - minY;

					// Calculate pixel-perfect position including offset within tile
					const screenX =
						((normalizedY + offsetWithinTileY) * tileSize -
							viewport.x * tileSize) *
						viewport.zoom;
					const screenY =
						((normalizedX + offsetWithinTileX) * tileSize -
							viewport.y * tileSize) *
						viewport.zoom;

					if (
						screenX > -20 &&
						screenX < canvas.width + 20 &&
						screenY > -20 &&
						screenY < canvas.height + 20
					) {
						// Scale marker size with zoom - smaller base size
						const baseSize = 4;
						const markerSize = Math.max(
							3,
							Math.min(8, baseSize * viewport.zoom),
						);

						const oreQualityTotal = [...marker.results].reduce(
							(sum, r) => sum + (r.readings?.quality ?? 0),
							0,
						);
						const fill =
							oreQualityTotal >= 15
								? "#00ff00"
								: oreQualityTotal >= 7
									? "#ffff00"
									: "#ffaa00";

						// Draw prospecting marker (orange square)
						ctx.fillStyle = fill;

						// Draw square marker for prospecting
						ctx.beginPath();
						ctx.arc(screenX, screenY, markerSize, 0, Math.PI * 2);
						ctx.fill();
					}
				}
			}
		}

		// Draw debug info
		if (bounds) {
			ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
			ctx.font = "12px monospace";
			ctx.fillText(
				`Zoom: ${viewport.zoom.toFixed(2)}x | Tiles: ${tiles.length} | Bounds: (${bounds.min_x},${bounds.min_y}) to (${bounds.max_x},${bounds.max_y})`,
				10,
				20,
			);
		}
	}, [
		tiles,
		viewport,
		imageCache,
		iconCache,
		bounds,
		containerSize,
		mapMarkers,
		prospectingLogs,
	]);

	// Helper function to convert marker position to screen coordinates
	const markerToScreen = useCallback(
		(
			position: { x: number; y: number; z: number },
			minX: number,
			minY: number,
			tileSize: number,
		) => {
			const markerTileX = Math.floor(position.y / MAP_CHUNK_SIZE);
			const markerTileY = Math.floor(position.x / MAP_CHUNK_SIZE);
			const offsetWithinTileX = (position.y % MAP_CHUNK_SIZE) / MAP_CHUNK_SIZE;
			const offsetWithinTileY = (position.x % MAP_CHUNK_SIZE) / MAP_CHUNK_SIZE;
			const normalizedX = markerTileX - minX;
			const normalizedY = markerTileY - minY;
			const screenX =
				((normalizedY + offsetWithinTileY) * tileSize - viewport.x * tileSize) *
				viewport.zoom;
			const screenY =
				((normalizedX + offsetWithinTileX) * tileSize - viewport.y * tileSize) *
				viewport.zoom;
			return { screenX, screenY };
		},
		[viewport],
	);

	// Mouse wheel zoom
	const handleWheel = useCallback(
		(e: React.WheelEvent) => {
			e.preventDefault();

			const canvas = canvasRef.current;
			if (!canvas || !tiles || tiles.length === 0) return;

			const rect = canvas.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			const tileSize = tiles[0]?.width || 512;

			setViewport((prev) => {
				const delta = e.deltaY > 0 ? 0.9 : 1.1;
				const newZoom = Math.max(0.1, Math.min(5, prev.zoom * delta));

				const worldMouseX = mouseX / (prev.zoom * tileSize) + prev.x;
				const worldMouseY = mouseY / (prev.zoom * tileSize) + prev.y;

				const newX = worldMouseX - mouseX / (newZoom * tileSize);
				const newY = worldMouseY - mouseY / (newZoom * tileSize);

				return {
					x: newX,
					y: newY,
					zoom: newZoom,
				};
			});
		},
		[tiles],
	);

	// Mouse panning
	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		if (e.button === 0) {
			setIsPanning(true);
			setLastMousePos({ x: e.clientX, y: e.clientY });
		}
	}, []);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (!canvasRef.current || !tiles || tiles.length === 0 || !bounds) return;

			const canvas = canvasRef.current;
			const rect = canvas.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			const tileSize = tiles[0]?.width || 512;
			const minX = Math.min(...tiles.map((t) => t.x));
			const minY = Math.min(...tiles.map((t) => t.y));

			// Convert screen to normalized viewport coords, then to block coordinates
			const worldX = mouseX / (viewport.zoom * tileSize) + viewport.x;
			const worldY = mouseY / (viewport.zoom * tileSize) + viewport.y;
			const absoluteX = Math.round((worldX + minY) * MAP_CHUNK_SIZE);
			const absoluteY = Math.round((worldY + minX) * MAP_CHUNK_SIZE);
			const vsX = absoluteX - spawnOffsetX;
			const vsY = absoluteY - spawnOffsetY;

			// Check if hovering over any marker
			let hoveredMarker: MapMarker | ProspectingMarker | null = null;
			let hoveredProspectMarker: ProspectingMarker | null = null;
			const hoverThreshold = 20;

			// Check waypoint markers
			if (mapMarkers?.markers) {
				for (const marker of mapMarkers.markers) {
					if (!marker.position) continue;
					const { screenX, screenY } = markerToScreen(
						marker.position,
						minX,
						minY,
						tileSize,
					);
					const distance = Math.sqrt(
						(mouseX - screenX) ** 2 + (mouseY - screenY) ** 2,
					);
					if (distance < hoverThreshold) {
						hoveredMarker = marker;
						break;
					}
				}
			}

			// Check prospecting markers if no waypoint hovered
			if (!hoveredMarker && prospectingLogs) {
				for (const [_playerUid, log] of prospectingLogs) {
					for (const marker of log.markers) {
						if (!marker.position) continue;
						const { screenX, screenY } = markerToScreen(
							marker.position,
							minX,
							minY,
							tileSize,
						);
						const distance = Math.sqrt(
							(mouseX - screenX) ** 2 + (mouseY - screenY) ** 2,
						);
						if (distance < hoverThreshold) {
							hoveredMarker = marker;
							hoveredProspectMarker = marker;
							break;
						}
					}
					if (hoveredMarker) break;
				}
			}

			if (hoveredProspectMarker) {
				setProspectingMarker(hoveredProspectMarker);
			} else {
				setProspectingMarker(null);
			}

			// Update cursor coordinates
			if (hoveredMarker?.position) {
				setCursorCoords({
					screenX: e.clientX,
					screenY: e.clientY,
					x: Math.round(hoveredMarker.position.x - spawnOffsetX),
					y: Math.round(hoveredMarker.position.z),
					z: Math.round(hoveredMarker.position.y - spawnOffsetY),
				});
			} else {
				setCursorCoords({
					screenX: e.clientX,
					screenY: e.clientY,
					x: vsX,
					y: vsY,
				});
			}

			// Handle panning
			if (isPanning) {
				const dx = e.clientX - lastMousePos.x;
				const dy = e.clientY - lastMousePos.y;
				setViewport((prev) => ({
					...prev,
					x: prev.x - dx / (tileSize * prev.zoom),
					y: prev.y - dy / (tileSize * prev.zoom),
				}));
				setLastMousePos({ x: e.clientX, y: e.clientY });
			}
		},
		[
			isPanning,
			lastMousePos,
			tiles,
			viewport,
			bounds,
			mapMarkers,
			prospectingLogs,
			markerToScreen,
			spawnOffsetX,
			spawnOffsetY,
		],
	);

	const handleMouseUp = useCallback(() => {
		setIsPanning(false);
	}, []);

	const handleMouseLeave = useCallback(() => {
		setIsPanning(false);
		setCursorCoords(null);
	}, []);

	if (tilesLoading || boundsLoading) {
		return (
			<Card className="flex items-center justify-center h-full min-h-[400px]">
				<div className="flex flex-col items-center gap-2">
					<Loader2Icon className="animate-spin h-8 w-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">Loading map...</p>
				</div>
			</Card>
		);
	}

	if (tilesError) {
		return (
			<Card className="flex items-center justify-center h-full min-h-[400px]">
				<div className="flex flex-col items-center gap-2 text-center p-4">
					<MapIcon className="h-12 w-12 text-muted-foreground opacity-50" />
					<p className="text-sm text-muted-foreground">
						{tilesError.message.includes("maps_not_found")
							? "No map data available yet. Explore the world in-game to generate the map!"
							: `Error loading map: ${tilesError.message}`}
					</p>
				</div>
			</Card>
		);
	}

	if (!tiles || tiles.length === 0) {
		return (
			<Card className="flex items-center justify-center h-full min-h-[400px]">
				<div className="flex flex-col items-center gap-2 text-center p-4">
					<MapIcon className="h-12 w-12 text-muted-foreground opacity-50" />
					<p className="text-sm text-muted-foreground">
						No map tiles found. Explore the world in-game to generate the map!
					</p>
				</div>
			</Card>
		);
	}

	return (
		<Card className="relative h-full min-h-[400px] overflow-hidden">
			<div
				className="w-full h-full"
				ref={containerRef}
				style={{ cursor: isPanning ? "grabbing" : "grab" }}
			>
				<canvas
					className="w-full h-full"
					onMouseDown={handleMouseDown}
					onMouseLeave={handleMouseLeave}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onWheel={handleWheel}
					ref={canvasRef}
				/>

				{/* Cursor coordinates display */}
				{cursorCoords && canvasRef.current && (
					<div
						className="absolute pointer-events-none bg-background/95 backdrop-blur-sm border rounded px-2 py-1 text-xs font-mono shadow-lg"
						style={{
							left: `${cursorCoords.screenX - canvasRef.current.getBoundingClientRect().left + 10}px`,
							top: `${cursorCoords.screenY - canvasRef.current.getBoundingClientRect().top + 60}px`,
							transform: "translate(0, -100%)",
						}}
					>
						{cursorCoords.z !== undefined
							? `${cursorCoords.x}, ${cursorCoords.y}, ${cursorCoords.z}`
							: `${cursorCoords.x}, ${cursorCoords.y}`}
						{prospectingMarker && (
							<div className="mt-1">
								<strong>Prospecting Results:</strong>
								<ul className="list-disc list-inside">
									{prospectingMarker.results
										.sort(sortByQuality)
										.map((result, index) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: Needed to display correctly
											<li
												className="text-xs flex gap-2"
												key={result.ore_code + index}
											>
												<p>
													{result.ore_code.charAt(0).toUpperCase() +
														result.ore_code.slice(1)}{" "}
													-
												</p>
												<p className="flex gap-1">
													<SparkleIcon
														className={cn(
															"size-3 text-muted-foreground",
															(result.readings?.quality ?? 0) > 10
																? "fill-success"
																: (result.readings?.quality ?? 0) > 5
																	? "fill-warning"
																	: "fill-destructive",
														)}
													/>
													{result.readings?.quality.toFixed(2) ?? 0} -
												</p>
												<p className="flex gap-1">
													<ArrowDownToDotIcon className="size-3 opacity-50" />
													{result.readings?.depth.toFixed(2) ?? 0}
												</p>
											</li>
										))}
								</ul>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Controls hint */}
			<div className="absolute bottom-1 right-1 bg-background/90 backdrop-blur-sm border rounded-md px-3 py-2 text-xs text-muted-foreground">
				<p>🖱️ Drag to pan • 🔍 Scroll to zoom</p>
			</div>
		</Card>
	);
}
