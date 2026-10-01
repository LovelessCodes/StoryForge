import { ArrowDownToDot, Loader2, Map as MapIcon, Sparkle } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import {
  imageDataToDataUrl,
  useAllMapTiles,
  useAllMapTilesByPath,
  useMapBounds,
  useMapBoundsByPath,
} from "@/hooks/use-world-map";
import { capitalizeFirstLetter } from "@/lib/helpers";
import type {
  MapMarker,
  MapMarkers,
  ProspectingLog,
  ProspectingMarker,
  ProspectResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** Map tile size in blocks (chunks). */
const MAP_CHUNK_SIZE = 32;
/** Vintage Story worlds spawn around block coordinate 512000. */
const SPAWN_COORDINATE = 512000;

const sortByQuality = (a: ProspectResult, b: ProspectResult) => {
  const qualityA = a.readings?.quality ?? 0;
  const qualityB = b.readings?.quality ?? 0;
  return qualityB - qualityA;
};

type WorldMapViewerProps = {
  worldPath?: string;
  mapPath?: string;
  mapMarkers?: MapMarkers | null | undefined;
  prospectingLogs?: [string, ProspectingLog][];
  selectedPlayer: string | null;
  showProspect: boolean;
};

type CursorCoords = {
  x: number;
  y: number;
  z?: number;
  screenX: number;
  screenY: number;
};

function StatePanel({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card flex h-full min-h-[24rem] w-full items-center justify-center border">
      <div className="flex flex-col items-center gap-2 p-4 text-center">{children}</div>
    </div>
  );
}

export function WorldMapViewer({
  worldPath,
  mapPath,
  mapMarkers,
  prospectingLogs,
  selectedPlayer,
  showProspect,
}: WorldMapViewerProps) {
  const {
    attachContainer,
    baseCanvasRef,
    canvasRect,
    cursorCoords,
    handleMouseDown,
    handleMouseLeave,
    handleMouseMove,
    handleMouseUp,
    hasTiles,
    isLoading,
    isPanning,
    overlayCanvasRef,
    prospectingMarker,
    tilesError,
  } = useWorldMapViewer({
    mapMarkers,
    mapPath,
    prospectingLogs,
    selectedPlayer,
    showProspect,
    worldPath,
  });

  if (isLoading) {
    return (
      <StatePanel>
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
        <p className="text-muted-foreground text-sm">Loading map…</p>
      </StatePanel>
    );
  }

  if (tilesError) {
    return (
      <StatePanel>
        <MapIcon className="text-muted-foreground size-12 opacity-50" />
        <p className="text-muted-foreground text-sm">
          {tilesError.message.includes("maps_not_found")
            ? "No map data available yet. Explore the world in-game to generate the map!"
            : `Error loading map: ${tilesError.message}`}
        </p>
      </StatePanel>
    );
  }

  if (!hasTiles) {
    return (
      <StatePanel>
        <MapIcon className="text-muted-foreground size-12 opacity-50" />
        <p className="text-muted-foreground text-sm">
          No map tiles found. Explore the world in-game to generate the map!
        </p>
      </StatePanel>
    );
  }

  return (
    <div className="bg-card relative h-full min-h-[24rem] w-full overflow-hidden border">
      <div
        className="h-full w-full"
        ref={attachContainer}
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
      >
        <canvas
          className="pointer-events-none absolute inset-0 h-full w-full"
          ref={baseCanvasRef}
        />
        <canvas
          className="absolute inset-0 h-full w-full"
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          ref={overlayCanvasRef}
        />
        {/* Cursor coordinates display */}
        {cursorCoords && canvasRect && (
          <div
            className="bg-popover/95 pointer-events-none absolute border px-2 py-1 font-mono text-xs shadow-lg backdrop-blur-sm"
            style={{
              left: `${Math.min(cursorCoords.screenX - canvasRect.left + 12, canvasRect.width - 160)}px`,
              top: `${Math.min(Math.max(cursorCoords.screenY - canvasRect.top - 12, 4), canvasRect.height - 4)}px`,
            }}
          >
            {cursorCoords.z !== undefined
              ? `${cursorCoords.x}, ${cursorCoords.y}, ${cursorCoords.z}`
              : `${cursorCoords.x}, ${cursorCoords.y}`}
            {prospectingMarker && (
              <div className="mt-1">
                <strong>Prospecting Results:</strong>
                <ul className="list-inside list-disc">
                  {prospectingMarker.results.toSorted(sortByQuality).map((result) => {
                    const stableKey = `${result.ore_code}-${result.readings?.depth ?? 0}-${result.readings?.quality ?? 0}`;
                    return (
                      <li className="flex gap-2 text-xs" key={stableKey}>
                        <p>{capitalizeFirstLetter(result.ore_code)} -</p>
                        <p className="flex gap-1">
                          <Sparkle
                            className={cn(
                              "text-muted-foreground size-3",
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
                          <ArrowDownToDot className="size-3 opacity-50" />
                          {result.readings?.depth.toFixed(2) ?? 0}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="bg-background/90 text-muted-foreground pointer-events-none absolute right-1 bottom-1 border px-3 py-2 text-xs backdrop-blur-sm">
        <p>Drag to pan · Scroll to zoom</p>
      </div>
    </div>
  );
}

/** All map loading, rendering and interaction state for WorldMapViewer. */
function useWorldMapViewer({
  mapMarkers,
  mapPath,
  prospectingLogs,
  selectedPlayer,
  showProspect,
  worldPath,
}: WorldMapViewerProps) {
  // Use direct path if provided, otherwise world path
  const effectivePath = mapPath ?? worldPath ?? "";
  const isDirectPath = !!mapPath;
  // Base (tiles) and overlay (markers, cursor) canvases
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hooks must be called unconditionally at the top level. Only pass the path
  // to the variant that matches it — sending a world save to the by-path
  // commands would make them parse a .vcdbs file as a map database.
  const allMapTiles = useAllMapTiles(isDirectPath ? "" : effectivePath);
  const allMapTilesByPath = useAllMapTilesByPath(isDirectPath ? effectivePath : "");
  const mapBounds = useMapBounds(isDirectPath ? "" : effectivePath);
  const mapBoundsByPath = useMapBoundsByPath(isDirectPath ? effectivePath : "");

  const {
    data: tiles,
    isLoading: tilesLoading,
    error: tilesError,
  } = isDirectPath ? allMapTilesByPath : allMapTiles;
  const { data: bounds, isLoading: boundsLoading } = isDirectPath ? mapBoundsByPath : mapBounds;

  // Viewport state (x, y = top-left corner in world coords, zoom = scale factor)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 0.5 });
  const viewportRef = useRef(viewport);

  // Cached invariants (min tile coords & tile size)
  const minXRef = useRef<number | null>(null);
  const minYRef = useRef<number | null>(null);
  const tileSizeRef = useRef<number | null>(null);

  // LOD (level-of-detail) cache: Map<level, { groupSize, tiles: Map<"x,y", HTMLCanvasElement> }>
  const lodCacheRef = useRef<
    Map<number, { groupSize: number; tiles: Map<string, HTMLCanvasElement> }>
  >(new Map());

  // rAF throttle flags
  const rafPendingRef = useRef(false);

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Cursor coordinates state. Updates are throttled to one per animation
  // frame - mousemove fires far more often than the tooltip needs to move, and
  // every set re-renders this component.
  const [cursorCoords, setCursorCoords] = useState<CursorCoords | null>(null);
  const pendingCursorRef = useRef<CursorCoords | null>(null);
  const cursorRafRef = useRef<number | null>(null);
  const scheduleCursorUpdate = useCallback((coords: CursorCoords) => {
    pendingCursorRef.current = coords;
    if (cursorRafRef.current !== null) return;
    cursorRafRef.current = requestAnimationFrame(() => {
      cursorRafRef.current = null;
      setCursorCoords(pendingCursorRef.current);
    });
  }, []);
  useEffect(
    () => () => {
      if (cursorRafRef.current !== null) cancelAnimationFrame(cursorRafRef.current);
    },
    [],
  );

  // Cache of colour-tinted marker icons, keyed by icon + colour + opacity + size
  const tintedIconCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const getTintedIcon = useCallback(
    (icon: HTMLImageElement, color: number, opacity: number, size: number) => {
      const key = `${icon.src}|${color}|${opacity}|${size}`;
      const cached = tintedIconCacheRef.current.get(key);
      if (cached) return cached;

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(icon, 0, 0, size, size);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = `rgba(${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff}, ${Math.min(Math.max(opacity / 255, 0), 1)})`;
      ctx.fillRect(0, 0, size, size);
      tintedIconCacheRef.current.set(key, canvas);
      return canvas;
    },
    [],
  );

  // Currently hovered prospecting marker
  const [prospectingMarker, setProspectingMarker] = useState<ProspectingMarker | null>(null);

  // Cache loaded images (ref — only read in draw callbacks, not JSX)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [imageVersion, setImageVersion] = useState(0);

  // Cache for marker icons (ref — only read in draw callbacks, not JSX)
  const iconCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Track container size (ref — triggers redraw directly from ResizeObserver)
  const containerSizeRef = useRef({ height: 0, width: 0 });

  // Pre-calculate spawn offset (Vintage Story worlds spawn around block coordinate 512000)
  const spawnOffsetX = bounds
    ? Math.round((bounds.min_y * MAP_CHUNK_SIZE) / SPAWN_COORDINATE) * SPAWN_COORDINATE
    : 0;
  const spawnOffsetY = bounds
    ? Math.round((bounds.min_x * MAP_CHUNK_SIZE) / SPAWN_COORDINATE) * SPAWN_COORDINATE
    : 0;

  // Observe container resize to trigger re-render.
  // Uses a ref to always call the latest scheduleRedraw. Attached through a
  // callback ref because the container only mounts after the loading
  // branches - a mount-time effect ran while the ref was still null and the
  // observer was never registered.
  const scheduleRedrawRef = useRef<() => void>(undefined);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Canvas rect for the cursor tooltip, captured in the resize callback so the
  // render never has to read the canvas ref.
  const [canvasRect, setCanvasRect] = useState<{
    height: number;
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const attachContainer = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    containerRef.current = node;
    if (!node) {
      setCanvasRect(null);
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      setCanvasRect(node.getBoundingClientRect());
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        containerSizeRef.current = { height, width };
        scheduleRedrawRef.current?.();
      }
    });
    resizeObserver.observe(node);
    resizeObserverRef.current = resizeObserver;
  }, []);

  useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

  // Initialize viewport when bounds are loaded
  useEffect(() => {
    if (bounds && containerRef.current && tiles && tiles.length > 0) {
      const normalizedWidth = bounds.max_y - bounds.min_y + 1;
      const normalizedHeight = bounds.max_x - bounds.min_x + 1;
      const tileSize = tiles[0]?.width || 512;
      const mapPixelWidth = normalizedWidth * tileSize;
      const mapPixelHeight = normalizedHeight * tileSize;
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const zoomX = containerWidth / mapPixelWidth;
      const zoomY = containerHeight / mapPixelHeight;
      const fitZoom = Math.min(zoomX, zoomY) * 0.9;
      const newViewport = {
        x: normalizedWidth / 2 - containerWidth / (2 * tileSize * fitZoom),
        y: normalizedHeight / 2 - containerHeight / (2 * tileSize * fitZoom),
        zoom: fitZoom,
      };
      viewportRef.current = newViewport;
      setViewport(newViewport);
    }
  }, [bounds, tiles]);

  // Load and cache images when tiles change
  useEffect(() => {
    if (!tiles) return;
    for (const tile of tiles) {
      const key = `${tile.x},${tile.y}`;
      if (!imageCacheRef.current.has(key)) {
        const img = new Image();
        img.src = imageDataToDataUrl(tile.image_data);
        img.onload = () => {
          imageCacheRef.current.set(key, img);
          setImageVersion((v) => v + 1);
          scheduleRedrawRef.current?.();
        };
      }
    }
  }, [tiles]);

  // Cache minX/minY/tileSize once when tiles & images ready
  useEffect(() => {
    if (!tiles || tiles.length === 0) return;
    // Ensure most images are loaded (best effort)
    const tileSize = tiles[0]?.width || 512;
    const xs = tiles.map((t) => t.x);
    const ys = tiles.map((t) => t.y);
    minXRef.current = Math.min(...xs);
    minYRef.current = Math.min(...ys);
    tileSizeRef.current = tileSize;
  }, [tiles]);

  // Build LOD levels (2x2, 4x4, 8x8) after all base images loaded
  useEffect(() => {
    if (!tiles || tiles.length === 0) return;
    if (!tileSizeRef.current || minXRef.current === null || minYRef.current === null) return;
    // Wait until imageCache size matches tiles length (all loaded)
    if (imageCacheRef.current.size !== tiles.length) return;
    const existingLevels = lodCacheRef.current;
    const levels = [
      { groupSize: 2, level: 1 },
      { groupSize: 4, level: 2 },
      { groupSize: 8, level: 3 },
    ];
    const baseTileSize = tileSizeRef.current;
    for (const { level, groupSize } of levels) {
      if (existingLevels.has(level)) continue;
      const compositeMap = new Map<string, HTMLCanvasElement>();
      // Group tiles
      for (const tile of tiles) {
        // Determine top-left origin for this group
        const groupX = Math.floor(tile.x / groupSize) * groupSize;
        const groupY = Math.floor(tile.y / groupSize) * groupSize;
        const key = `${groupX},${groupY}`;
        if (!compositeMap.has(key)) {
          // Build composite
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = baseTileSize * groupSize;
          tempCanvas.height = baseTileSize * groupSize;
          const tCtx = tempCanvas.getContext("2d");
          if (!tCtx) continue;
          // Draw all tiles in the group
          for (let dx = 0; dx < groupSize; dx++) {
            for (let dy = 0; dy < groupSize; dy++) {
              const sx = groupX + dx;
              const sy = groupY + dy;
              const img = imageCacheRef.current.get(`${sx},${sy}`);
              if (!img) continue;
              // Remember axis swap: vertical = x index (tile.x), horizontal = y index (tile.y)
              // In composite we keep same orientation: rows by dx, cols by dy
              tCtx.drawImage(img, dy * baseTileSize, dx * baseTileSize, baseTileSize, baseTileSize);
            }
          }
          // Downscale to one tileSize canvas (mipmap-like)
          const finalCanvas = document.createElement("canvas");
          finalCanvas.width = baseTileSize;
          finalCanvas.height = baseTileSize;
          const fCtx = finalCanvas.getContext("2d");
          if (fCtx) {
            fCtx.imageSmoothingEnabled = true;
            fCtx.drawImage(tempCanvas, 0, 0, finalCanvas.width, finalCanvas.height);
            compositeMap.set(key, finalCanvas);
          }
        }
      }
      existingLevels.set(level, { groupSize, tiles: compositeMap });
    }
  }, [tiles, imageVersion]);

  // Load and cache marker icons
  useEffect(() => {
    if (!mapMarkers?.markers) return;

    const uniqueIcons = new Set(
      mapMarkers.markers.flatMap((marker) => (marker.icon ? [marker.icon] : [])),
    );

    for (const iconName of uniqueIcons) {
      if (!iconCacheRef.current.has(iconName)) {
        const img = new Image();
        // Try to load the icon from assets
        // Using relative path that Vite will resolve
        img.src = `/map-icons/${iconName}.svg`;
        img.onload = () => {
          iconCacheRef.current.set(iconName, img);
          scheduleRedrawRef.current?.();
        };
        img.onerror = () => {
          // Icon not found - mark as missing so we don't try again
          iconCacheRef.current.set(iconName, new Image());
        };
      }
    }
  }, [mapMarkers]);

  // Choose LOD level based on zoom
  const chooseLodLevel = useCallback((zoom: number) => {
    if (zoom >= 1) return 0;
    if (zoom >= 0.5) return 1;
    if (zoom >= 0.25) return 2;
    return 3;
  }, []);

  // Draw base tiles (with LOD)
  const drawBase = useCallback(() => {
    if (!baseCanvasRef.current || !tiles || tiles.length === 0) return;
    if (minXRef.current === null || minYRef.current === null || !tileSizeRef.current) return;
    const canvas = baseCanvasRef.current;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const minX = minXRef.current;
    const minY = minYRef.current;
    const tileSize = tileSizeRef.current;
    const level = chooseLodLevel(viewportRef.current.zoom);
    if (level === 0) {
      for (const tile of tiles) {
        const img = imageCacheRef.current.get(`${tile.x},${tile.y}`);
        if (!img || !img.complete) continue;
        const normalizedX = tile.x - minX;
        const normalizedY = tile.y - minY;
        const zoom = viewportRef.current.zoom;
        const screenX = (normalizedY * tileSize - viewportRef.current.x * tileSize) * zoom;
        const screenY = (normalizedX * tileSize - viewportRef.current.y * tileSize) * zoom;
        const screenSize = tileSize * zoom;
        if (
          screenX + screenSize > 0 &&
          screenX < canvas.width &&
          screenY + screenSize > 0 &&
          screenY < canvas.height &&
          screenSize >= 2
        ) {
          ctx.drawImage(img, screenX, screenY, screenSize, screenSize);
        }
      }
    } else {
      const lod = lodCacheRef.current.get(level);
      if (lod) {
        for (const [key, compCanvas] of lod.tiles) {
          const [gxStr, gyStr] = key.split(",");
          const gx = parseInt(gxStr, 10);
          const gy = parseInt(gyStr, 10);
          const normalizedX = gx - minX;
          const normalizedY = gy - minY;

          const zoom = viewportRef.current.zoom;
          const screenX = (normalizedY * tileSize - viewportRef.current.x * tileSize) * zoom;
          const screenY = (normalizedX * tileSize - viewportRef.current.y * tileSize) * zoom;
          const screenSize = tileSize * zoom * lod.groupSize;
          if (
            screenX + screenSize > 0 &&
            screenX < canvas.width &&
            screenY + screenSize > 0 &&
            screenY < canvas.height
          ) {
            ctx.drawImage(compCanvas, screenX, screenY, screenSize, screenSize);
          }
        }
      }
    }
    // Debug overlay: development builds only.
    if (import.meta.env.DEV) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "12px monospace";
      ctx.fillText(
        `LOD: ${level} | Zoom: ${viewportRef.current.zoom.toFixed(2)} | Tiles: ${tiles.length}`,
        10,
        20,
      );
    }
  }, [tiles, chooseLodLevel]);

  // Draw overlay (markers, prospecting, cursor tooltip background not included)
  const drawOverlay = useCallback(() => {
    if (!overlayCanvasRef.current || !tiles || tiles.length === 0) return;
    if (minXRef.current === null || minYRef.current === null || !tileSizeRef.current) return;
    const canvas = overlayCanvasRef.current;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const minX = minXRef.current;
    const minY = minYRef.current;
    const tileSize = tileSizeRef.current;
    // Markers
    if (mapMarkers?.markers && viewportRef.current.zoom > 0.2) {
      for (const marker of mapMarkers.markers.filter((m) => m.player_uid === selectedPlayer)) {
        if (!marker.position) continue;
        const markerTileX = Math.floor(marker.position.y / MAP_CHUNK_SIZE);
        const markerTileY = Math.floor(marker.position.x / MAP_CHUNK_SIZE);
        const offsetWithinTileX = (marker.position.y % MAP_CHUNK_SIZE) / MAP_CHUNK_SIZE;
        const offsetWithinTileY = (marker.position.x % MAP_CHUNK_SIZE) / MAP_CHUNK_SIZE;
        const normalizedX = markerTileX - minX;
        const normalizedY = markerTileY - minY;
        const screenX =
          ((normalizedY + offsetWithinTileY) * tileSize - viewportRef.current.x * tileSize) *
          viewportRef.current.zoom;
        const screenY =
          ((normalizedX + offsetWithinTileX) * tileSize - viewportRef.current.y * tileSize) *
          viewportRef.current.zoom;
        if (
          screenX > -20 &&
          screenX < canvas.width + 20 &&
          screenY > -20 &&
          screenY < canvas.height + 20
        ) {
          const baseSize = 16;
          const iconSize = Math.max(12, Math.min(32, baseSize * viewportRef.current.zoom));
          const icon = marker.icon ? iconCacheRef.current.get(marker.icon) : null;
          let drawnSize = iconSize;
          if (icon?.complete && icon.naturalWidth > 0) {
            const tinted = getTintedIcon(icon, marker.color, marker.opacity, Math.round(iconSize));
            if (tinted) {
              ctx.save();
              ctx.shadowColor = "rgba(0,0,0,0.5)";
              ctx.shadowBlur = 4;
              ctx.shadowOffsetX = 1;
              ctx.shadowOffsetY = 1;
              ctx.drawImage(
                tinted,
                screenX - iconSize / 2,
                screenY - iconSize / 2,
                iconSize,
                iconSize,
              );
              ctx.restore();
            }
          } else {
            const markerSize = Math.max(4, Math.min(10, 5 * viewportRef.current.zoom));
            drawnSize = markerSize;
            ctx.fillStyle = "#ff0000";
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, screenY, markerSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          if (viewportRef.current.zoom > 0.3 && marker.label) {
            const fontSize = Math.max(10, Math.min(14, 12 * viewportRef.current.zoom));
            ctx.font = `${fontSize}px sans-serif`;
            const textWidth = ctx.measureText(marker.label).width;
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(
              screenX + drawnSize / 2 + 4,
              screenY - fontSize / 2 - 2,
              textWidth + 8,
              fontSize + 4,
            );
            ctx.fillStyle = "#ffffff";
            ctx.fillText(marker.label, screenX + drawnSize / 2 + 8, screenY + fontSize / 2 - 2);
          }
        }
      }
    }
    // Prospecting markers
    if (prospectingLogs && showProspect) {
      for (const [, log] of prospectingLogs.filter(([playerUid]) => playerUid === selectedPlayer)) {
        for (const marker of log.markers) {
          if (!marker.position) continue;
          const markerTileX = Math.floor(marker.position.y / MAP_CHUNK_SIZE);
          const markerTileY = Math.floor(marker.position.x / MAP_CHUNK_SIZE);
          const offsetWithinTileX = (marker.position.y % MAP_CHUNK_SIZE) / MAP_CHUNK_SIZE;
          const offsetWithinTileY = (marker.position.x % MAP_CHUNK_SIZE) / MAP_CHUNK_SIZE;
          const normalizedX = markerTileX - minX;
          const normalizedY = markerTileY - minY;
          const screenX =
            ((normalizedY + offsetWithinTileY) * tileSize - viewportRef.current.x * tileSize) *
            viewportRef.current.zoom;
          const screenY =
            ((normalizedX + offsetWithinTileX) * tileSize - viewportRef.current.y * tileSize) *
            viewportRef.current.zoom;
          if (
            screenX > -20 &&
            screenX < canvas.width + 20 &&
            screenY > -20 &&
            screenY < canvas.height + 20
          ) {
            const baseSize = 4;
            const markerSize = Math.max(3, Math.min(8, baseSize * viewportRef.current.zoom));
            const oreQualityTotal = [...marker.results].reduce(
              (sum, r) => sum + (r.readings?.quality ?? 0),
              0,
            );
            const fill =
              oreQualityTotal >= 15 ? "#00ff00" : oreQualityTotal >= 7 ? "#ffff00" : "#ffaa00";
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.arc(screenX, screenY, markerSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }, [mapMarkers, prospectingLogs, selectedPlayer, showProspect, tiles, getTintedIcon]);

  // Schedule redraw (throttled)
  const scheduleRedraw = useCallback(() => {
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      drawBase();
      drawOverlay();
    });
  }, [drawBase, drawOverlay]);

  // Keep scheduleRedrawRef current for the ResizeObserver callback.
  useEffect(() => {
    scheduleRedrawRef.current = scheduleRedraw;
  }, [scheduleRedraw]);

  // Redraw when dependencies change
  // Redraw on essential viewport/data changes (intentionally excluding image/icon caches to reduce churn)
  useEffect(() => {
    scheduleRedraw();
  }, [viewport, tiles, mapMarkers, prospectingLogs, showProspect, scheduleRedraw]);

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
        ((normalizedY + offsetWithinTileY) * tileSize - viewport.x * tileSize) * viewport.zoom;
      const screenY =
        ((normalizedX + offsetWithinTileX) * tileSize - viewport.y * tileSize) * viewport.zoom;
      return { screenX, screenY };
    },
    [viewport],
  );

  // Mouse wheel zoom. Pure handler: the state updater must not perform side
  // effects (React may invoke it twice), so the next viewport is computed
  // here and the ref/state are set directly.
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const canvas = overlayCanvasRef.current;
      if (!canvas || !tiles || tiles.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const tileSize = tiles[0]?.width || 512;

      const prev = viewportRef.current;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(5, prev.zoom * delta));
      const worldMouseX = mouseX / (prev.zoom * tileSize) + prev.x;
      const worldMouseY = mouseY / (prev.zoom * tileSize) + prev.y;
      const updated = {
        x: worldMouseX - mouseX / (newZoom * tileSize),
        y: worldMouseY - mouseY / (newZoom * tileSize),
        zoom: newZoom,
      };

      viewportRef.current = updated;
      setViewport(updated);
      scheduleRedraw();
    },
    [tiles, scheduleRedraw],
  );

  // React registers wheel listeners as passive, so preventDefault inside the
  // JSX handler was a no-op and the page scrolled while zooming. Attach a
  // non-passive listener once the canvas exists.
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => handleWheel(e);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [handleWheel]);

  // Mouse panning
  const handleMouseDown = useCallback((e: ReactMouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      if (!overlayCanvasRef.current || !tiles || tiles.length === 0 || !bounds) return;
      const canvas = overlayCanvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const tileSize = tiles[0]?.width || 512;
      const minX = minXRef.current ?? Math.min(...tiles.map((t) => t.x));
      const minY = minYRef.current ?? Math.min(...tiles.map((t) => t.y));
      // Convert screen to normalized viewport coords, then to block coordinates
      const worldX = mouseX / (viewportRef.current.zoom * tileSize) + viewportRef.current.x;
      const worldY = mouseY / (viewportRef.current.zoom * tileSize) + viewportRef.current.y;
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
        for (const marker of mapMarkers.markers.filter((m) => m.player_uid === selectedPlayer)) {
          if (!marker.position) continue;
          const { screenX, screenY } = markerToScreen(marker.position, minX, minY, tileSize);
          const distance = Math.sqrt((mouseX - screenX) ** 2 + (mouseY - screenY) ** 2);
          if (distance < hoverThreshold) {
            hoveredMarker = marker;
            break;
          }
        }
      }

      // Check prospecting markers if no waypoint hovered
      if (!hoveredMarker && prospectingLogs && showProspect) {
        for (const [, log] of prospectingLogs.filter(
          ([playerUid]) => playerUid === selectedPlayer,
        )) {
          for (const marker of log.markers) {
            if (!marker.position) continue;
            const { screenX, screenY } = markerToScreen(marker.position, minX, minY, tileSize);
            const distance = Math.sqrt((mouseX - screenX) ** 2 + (mouseY - screenY) ** 2);
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

      // Update cursor coordinates (rAF-throttled)
      if (hoveredMarker?.position) {
        scheduleCursorUpdate({
          screenX: e.clientX,
          screenY: e.clientY,
          x: Math.round(hoveredMarker.position.x - spawnOffsetX),
          y: Math.round(hoveredMarker.position.z),
          z: Math.round(hoveredMarker.position.y - spawnOffsetY),
        });
      } else {
        scheduleCursorUpdate({
          screenX: e.clientX,
          screenY: e.clientY,
          x: vsX,
          y: vsY,
        });
      }

      // Handle panning
      if (isPanning) {
        const dx = e.clientX - lastMousePosRef.current.x;
        const dy = e.clientY - lastMousePosRef.current.y;
        const prev = viewportRef.current;
        const updated = {
          ...prev,
          x: prev.x - dx / (tileSize * prev.zoom),
          y: prev.y - dy / (tileSize * prev.zoom),
        };
        viewportRef.current = updated;
        // Throttle state update
        if (!rafPendingRef.current) {
          rafPendingRef.current = true;
          requestAnimationFrame(() => {
            rafPendingRef.current = false;
            setViewport(viewportRef.current);
            drawBase();
            drawOverlay();
          });
        }
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    [
      isPanning,
      tiles,
      bounds,
      mapMarkers,
      prospectingLogs,
      markerToScreen,
      spawnOffsetX,
      spawnOffsetY,
      selectedPlayer,
      showProspect,
      drawBase,
      drawOverlay,
      scheduleCursorUpdate,
    ],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    if (cursorRafRef.current !== null) {
      cancelAnimationFrame(cursorRafRef.current);
      cursorRafRef.current = null;
    }
    pendingCursorRef.current = null;
    setCursorCoords(null);
  }, []);

  return {
    attachContainer,
    baseCanvasRef,
    canvasRect,
    cursorCoords,
    handleMouseDown,
    handleMouseLeave,
    handleMouseMove,
    handleMouseUp,
    hasTiles: Boolean(tiles && tiles.length > 0),
    isLoading: tilesLoading || boundsLoading,
    isPanning,
    overlayCanvasRef,
    prospectingMarker,
    tilesError,
  };
}
