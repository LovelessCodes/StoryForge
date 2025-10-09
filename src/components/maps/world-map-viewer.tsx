import { useRef, useEffect, useState, useCallback } from "react";
import { Loader2Icon, MapIcon } from "lucide-react";
import { useAllMapTiles, useMapBounds, imageDataToDataUrl } from "@/hooks/use-world-map";
import type { MapMarkers, ProspectingLog } from "@/hooks/use-saves";
import { Card } from "@/components/ui/card";

type WorldMapViewerProps = {
	worldPath: string;
	mapMarkers?: MapMarkers | null | undefined;
	prospectingLogs?: [string, ProspectingLog][];
};

export function WorldMapViewer({ worldPath, mapMarkers, prospectingLogs }: WorldMapViewerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const { data: tiles, isLoading: tilesLoading, error: tilesError } = useAllMapTiles(worldPath);
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

	// Cache loaded images
	const [imageCache, setImageCache] = useState<Map<string, HTMLImageElement>>(
		new Map(),
	);

	// Track container size for re-rendering on resize
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

	// Observe container resize to trigger re-render
	useEffect(() => {
		if (!containerRef.current) return;

		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				setContainerSize({ width, height });
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

	// Render the map
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
			const screenX = (normalizedY * tileSize - viewport.x * tileSize) * viewport.zoom;
			const screenY = (normalizedX * tileSize - viewport.y * tileSize) * viewport.zoom;
			const screenSize = tileSize * viewport.zoom;

			// Only draw if visible
			if (
				screenX + screenSize > 0 &&
				screenX < canvas.width &&
				screenY + screenSize > 0 &&
				screenY < canvas.height
			) {
				ctx.drawImage(img, screenX, screenY, screenSize, screenSize);
			}
		}

		// Draw map markers
		if (mapMarkers?.markers) {
			let drawnCount = 0;
			let debugMarkerInfo = "";
			
			for (const marker of mapMarkers.markers) {
				if (!marker.position) continue;

				// Vintage Story coordinates: X = east-west, Y = north-south, Z = altitude
				// Map uses X and Y (horizontal plane), Z is height and not used for 2D map
				// Map chunks are at 1:32 scale (each map chunk unit = 32 blocks)
				// NOTE: X and Y are swapped to match map orientation
				const mapChunkSize = 32;
				
				// Calculate which tile the marker is in
				const markerTileX = Math.floor(marker.position.y / mapChunkSize); // Swap: use Y for tileX
				const markerTileY = Math.floor(marker.position.x / mapChunkSize); // Swap: use X for tileY
				
				// Calculate position WITHIN the tile (0-1 range)
				const offsetWithinTileX = (marker.position.y % mapChunkSize) / mapChunkSize;
				const offsetWithinTileY = (marker.position.x % mapChunkSize) / mapChunkSize;

				const normalizedX = markerTileX - minX;
				const normalizedY = markerTileY - minY;

				// Calculate pixel-perfect position including offset within tile
				// Swap X and Y for screen coordinates (same as tiles)
				const screenX = ((normalizedY + offsetWithinTileY) * tileSize - viewport.x * tileSize) * viewport.zoom;
				const screenY = ((normalizedX + offsetWithinTileX) * tileSize - viewport.y * tileSize) * viewport.zoom;
				
				// Store first marker's detailed info for debugging
				if (!debugMarkerInfo) {
					debugMarkerInfo = `M1: icon="${marker.icon}" label="${marker.label}"`;
				}

				// Only draw if visible
				if (
					screenX > -20 &&
					screenX < canvas.width + 20 &&
					screenY > -20 &&
					screenY < canvas.height + 20
				) {
					// Parse icon string for color
					// Icon format can be "circle-<color>" or just a color name
					let markerColor = "#ff0000"; // Default red
					
					if (marker.icon) {
						// Map color names to hex values (supporting various formats)
						const colorMap: Record<string, string> = {
							red: "#ff0000",
							blue: "#0066ff",
							green: "#00ff00",
							yellow: "#ffff00",
							orange: "#ff8800",
							purple: "#aa00ff",
							pink: "#ff00ff",
							white: "#ffffff",
							black: "#000000",
							cyan: "#00ffff",
							lime: "#88ff00",
							brown: "#8b4513",
						};
						
						// Try to extract color from icon string
						const iconLower = marker.icon.toLowerCase();
						
						// Check if it starts with "circle-" and extract color
						if (iconLower.startsWith("circle-")) {
							const colorName = iconLower.replace("circle-", "");
							markerColor = colorMap[colorName] || markerColor;
						} 
						// Check if the icon itself is a color name
						else if (colorMap[iconLower]) {
							markerColor = colorMap[iconLower];
						}
						// Check if it's a hex color
						else if (iconLower.startsWith("#")) {
							markerColor = marker.icon;
						}
					}

					// Scale marker size with zoom - smaller base size
					const baseSize = 5;
					const markerSize = Math.max(4, Math.min(10, baseSize * viewport.zoom));
					
					// Draw marker pin
					ctx.fillStyle = markerColor;
					ctx.strokeStyle = "#ffffff";
					ctx.lineWidth = 2;

					// Draw pin shape
					ctx.beginPath();
					ctx.arc(screenX, screenY, markerSize, 0, Math.PI * 2);
					ctx.fill();
					ctx.stroke();

					// Draw label if zoomed in enough
					if (viewport.zoom > 0.3 && marker.label) {
						const fontSize = Math.max(10, Math.min(14, 12 * viewport.zoom));
						ctx.font = `${fontSize}px sans-serif`;
						const textWidth = ctx.measureText(marker.label).width;
						
						ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
						ctx.fillRect(
							screenX + markerSize + 4,
							screenY - fontSize / 2 - 2,
							textWidth + 8,
							fontSize + 4
						);
						ctx.fillStyle = "#ffffff";
						ctx.fillText(
							marker.label,
							screenX + markerSize + 8,
							screenY + fontSize / 2 - 2
						);
					}
					
					drawnCount++;
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
					const offsetWithinTileX = (marker.position.y % mapChunkSize) / mapChunkSize;
					const offsetWithinTileY = (marker.position.x % mapChunkSize) / mapChunkSize;

					const normalizedX = markerTileX - minX;
					const normalizedY = markerTileY - minY;

					// Calculate pixel-perfect position including offset within tile
					const screenX = ((normalizedY + offsetWithinTileY) * tileSize - viewport.x * tileSize) * viewport.zoom;
					const screenY = ((normalizedX + offsetWithinTileX) * tileSize - viewport.y * tileSize) * viewport.zoom;

					if (
						screenX > -20 &&
						screenX < canvas.width + 20 &&
						screenY > -20 &&
						screenY < canvas.height + 20
					) {
						// Scale marker size with zoom - smaller base size
						const baseSize = 4;
						const markerSize = Math.max(3, Math.min(8, baseSize * viewport.zoom));
						
						// Draw prospecting marker (orange square)
						ctx.fillStyle = "#ffaa00";
						ctx.strokeStyle = "#ffffff";
						ctx.lineWidth = 2;

						// Draw square marker for prospecting
						ctx.beginPath();
						ctx.rect(screenX - markerSize, screenY - markerSize, markerSize * 2, markerSize * 2);
						ctx.fill();
						ctx.stroke();

						// Show ore info if zoomed in
						if (viewport.zoom > 0.5 && marker.results.length > 0) {
							const oreNames = marker.results.map(r => r.ore_code.split('-').pop()).join(", ");
							const fontSize = Math.max(10, Math.min(12, 11 * viewport.zoom));
							ctx.font = `${fontSize}px sans-serif`;
							const textWidth = ctx.measureText(oreNames).width;
							
							ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
							ctx.fillRect(
								screenX + markerSize + 4,
								screenY - fontSize / 2 - 2,
								textWidth + 8,
								fontSize + 4
							);
							ctx.fillStyle = "#ffaa00";
							ctx.fillText(
								oreNames,
								screenX + markerSize + 8,
								screenY + fontSize / 2 - 2
							);
						}
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
	}, [tiles, viewport, imageCache, bounds, containerSize, mapMarkers, prospectingLogs]);

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
			if (!isPanning || !tiles || tiles.length === 0) return;

			const dx = e.clientX - lastMousePos.x;
			const dy = e.clientY - lastMousePos.y;

			const tileSize = tiles[0]?.width || 512;
			
			setViewport((prev) => ({
				...prev,
				// Convert screen pixels to viewport coords using previous zoom
				x: prev.x - dx / (tileSize * prev.zoom),
				y: prev.y - dy / (tileSize * prev.zoom),
			}));

			setLastMousePos({ x: e.clientX, y: e.clientY });
		},
		[isPanning, lastMousePos, tiles],
	);

	const handleMouseUp = useCallback(() => {
		setIsPanning(false);
	}, []);

	const handleMouseLeave = useCallback(() => {
		setIsPanning(false);
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
				ref={containerRef}
				className="w-full h-full"
				style={{ cursor: isPanning ? "grabbing" : "grab" }}
			>
				<canvas
					ref={canvasRef}
					className="w-full h-full"
					onWheel={handleWheel}
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseLeave}
				/>
			</div>

			{/* Controls hint */}
			<div className="absolute bottom-4 right-4 bg-background/90 backdrop-blur-sm border rounded-md px-3 py-2 text-xs text-muted-foreground">
				<p>🖱️ Drag to pan • 🔍 Scroll to zoom</p>
			</div>
		</Card>
	);
}

