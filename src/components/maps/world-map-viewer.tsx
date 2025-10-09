import { useRef, useEffect, useState, useCallback } from "react";
import { Loader2Icon, MapIcon } from "lucide-react";
import { useAllMapTiles, useMapBounds, imageDataToDataUrl } from "@/hooks/use-world-map";
import { Card } from "@/components/ui/card";

type WorldMapViewerProps = {
	worldPath: string;
};

export function WorldMapViewer({ worldPath }: WorldMapViewerProps) {
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
			const tileSize = tile.width;
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
	}, [tiles, viewport, imageCache, bounds, containerSize]);

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

