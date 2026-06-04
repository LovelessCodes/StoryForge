import { ArrowDownToDotIcon, Loader2Icon, MapIcon, SparkleIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Card } from "@/components/ui/card";
import {
  imageDataToDataUrl,
  useAllMapTiles,
  useAllMapTilesByPath,
  useMapBounds,
  useMapBoundsByPath,
} from "@/hooks/use-world-map";
import type {
  MapMarker,
  MapMarkers,
  ProspectingLog,
  ProspectingMarker,
  ProspectResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";

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

export function WorldMapViewer({
  worldPath,
  mapPath,
  mapMarkers,
  prospectingLogs,
  selectedPlayer,
  showProspect,
}: WorldMapViewerProps) {
  // Use direct path if provided, otherwise world path
  const effectivePath = mapPath ?? worldPath ?? "";
  const isDirectPath = !!mapPath;
  // Base (tiles) and overlay (markers, cursor) canvases
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hooks must be called unconditionally at the top level
  const allMapTiles = useAllMapTiles(effectivePath);
  const allMapTilesByPath = useAllMapTilesByPath(effectivePath);
  const mapBounds = useMapBounds(effectivePath);
  const mapBoundsByPath = useMapBoundsByPath(effectivePath);

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
  >(null!);
  if (lodCacheRef.current === null) lodCacheRef.current = new Map();

  // rAF throttle flags
  const rafPendingRef = useRef(false);

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Cursor coordinates state
  const [cursorCoords, setCursorCoords] = useState<{
    x: number;
    y: number;
    z?: number;
    screenX: number;
    screenY: number;
  } | null>(null);

  // Currently hovered prospecting marker
  const [prospectingMarker, setProspectingMarker] = useState<ProspectingMarker | null>(null);

  // Cache loaded images (ref — only read in draw callbacks, not JSX)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(null!);
  if (imageCacheRef.current === null) imageCacheRef.current = new Map();
  const [imageVersion, setImageVersion] = useState(0);

  // Cache for marker icons (ref — only read in draw callbacks, not JSX)
  const iconCacheRef = useRef<Map<string, HTMLImageElement>>(null!);
  if (iconCacheRef.current === null) iconCacheRef.current = new Map();

  // Track container size (ref — triggers redraw directly from ResizeObserver)
  const containerSizeRef = useRef({ height: 0, width: 0 });

  // Pre-calculate spawn offset (Vintage Story worlds spawn around block coordinate 512000)
  const SPAWN_COORDINATE = 512000;
  const MAP_CHUNK_SIZE = 32;
  const spawnOffsetX = bounds
    ? Math.round((bounds.min_y * MAP_CHUNK_SIZE) / SPAWN_COORDINATE) * SPAWN_COORDINATE
    : 0;
  const spawnOffsetY = bounds
    ? Math.round((bounds.min_x * MAP_CHUNK_SIZE) / SPAWN_COORDINATE) * SPAWN_COORDINATE
    : 0;

  // Observe container resize to trigger re-render
  // Uses a ref to always call the latest scheduleRedraw
  const scheduleRedrawRef = useRef<() => void>(undefined);
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        containerSizeRef.current = { height, width };
        scheduleRedrawRef.current?.();
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
    // Debug info
    if (bounds) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "12px monospace";
      ctx.fillText(
        `LOD: ${level} | Zoom: ${viewportRef.current.zoom.toFixed(2)} | Tiles: ${tiles.length}`,
        10,
        20,
      );
    }
  }, [tiles, bounds, chooseLodLevel]);

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
        const mapChunkSize = 32;
        const markerTileX = Math.floor(marker.position.y / mapChunkSize);
        const markerTileY = Math.floor(marker.position.x / mapChunkSize);
        const offsetWithinTileX = (marker.position.y % mapChunkSize) / mapChunkSize;
        const offsetWithinTileY = (marker.position.x % mapChunkSize) / mapChunkSize;
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
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.5)";
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
              ctx.drawImage(tempCanvas, screenX - iconSize / 2, screenY - iconSize / 2);
            }
            ctx.restore();
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
      for (const [_playerUid, log] of prospectingLogs.filter(
        ([playerUid]) => playerUid === selectedPlayer,
      )) {
        for (const marker of log.markers) {
          if (!marker.position) continue;
          const mapChunkSize = 32;
          const markerTileX = Math.floor(marker.position.y / mapChunkSize);
          const markerTileY = Math.floor(marker.position.x / mapChunkSize);
          const offsetWithinTileX = (marker.position.y % mapChunkSize) / mapChunkSize;
          const offsetWithinTileY = (marker.position.x % mapChunkSize) / mapChunkSize;
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
  }, [mapMarkers, prospectingLogs, selectedPlayer, showProspect, tiles]);

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

  // Keep scheduleRedrawRef current for the ResizeObserver callback
  scheduleRedrawRef.current = scheduleRedraw;

  // Redraw when dependencies change
  // Redraw on essential viewport/data changes (intentionally excluding image/icon caches to reduce churn)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Needed
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

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const canvas = overlayCanvasRef.current;
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
        const vp = { x: newX, y: newY, zoom: newZoom };
        viewportRef.current = vp;
        scheduleRedraw();
        return vp;
      });
    },
    [tiles, scheduleRedraw],
  );

  // Mouse panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
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
        for (const [_playerUid, log] of prospectingLogs.filter(
          ([playerUid, _]) => playerUid === selectedPlayer,
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
      <Card className="flex h-full min-h-100 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2Icon className="text-muted-foreground size-8 animate-spin" />
          <p className="text-muted-foreground text-sm">Loading map…</p>
        </div>
      </Card>
    );
  }

  if (tilesError) {
    return (
      <Card className="flex h-full min-h-100 items-center justify-center">
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <MapIcon className="text-muted-foreground size-12 opacity-50" />
          <p className="text-muted-foreground text-sm">
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
      <Card className="flex h-full min-h-100 items-center justify-center">
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <MapIcon className="text-muted-foreground size-12 opacity-50" />
          <p className="text-muted-foreground text-sm">
            No map tiles found. Explore the world in-game to generate the map!
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="relative h-full min-h-100 overflow-hidden">
      <div
        className="h-full w-full"
        ref={containerRef}
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
          onWheel={handleWheel}
          ref={overlayCanvasRef}
        />
        {/* Cursor coordinates display */}
        {cursorCoords && overlayCanvasRef.current && (
          <div
            className="bg-background/95 pointer-events-none absolute rounded border px-2 py-1 font-mono text-xs shadow-lg backdrop-blur-sm"
            style={{
              left: (() => {
                const canvasRect = overlayCanvasRef.current?.getBoundingClientRect();
                if (!canvasRect) return 0;
                const rawLeft = cursorCoords.screenX - canvasRect.left + 12;
                return `${Math.min(rawLeft, canvasRect.width - 160)}px`;
              })(),
              top: (() => {
                const canvasRect = overlayCanvasRef.current?.getBoundingClientRect();
                if (!canvasRect) return 0;
                const rawTop = cursorCoords.screenY - canvasRect.top - 12;
                return `${Math.min(Math.max(rawTop, 4), canvasRect.height - 4)}px`;
              })(),
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
                        <p>
                          {result.ore_code.charAt(0).toUpperCase() + result.ore_code.slice(1)} -
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
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="bg-background/90 text-muted-foreground pointer-events-none absolute right-1 bottom-1 border px-3 py-2 text-xs backdrop-blur-sm">
        <p>🖱️ Drag to pan • 🔍 Scroll to zoom</p>
      </div>
    </Card>
  );
}
