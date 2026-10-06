import { toPng, toSvg } from "html-to-image";
import { getNodesBounds, getViewportForBounds } from "@xyflow/react";
import { MAX_WHITEBOARD_IMAGE_BYTES, WHITEBOARD_IMAGE_TYPES } from "@/lib/whiteboard";
import type { WbNode } from "./model";

export function isSupportedImage(file: File) {
  return (WHITEBOARD_IMAGE_TYPES as readonly string[]).includes(file.type);
}

function naturalSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 300, height: img.naturalHeight || 200 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 300, height: 200 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** Uploads an image for the board (the route stores it as an attachment) and returns its id and size. */
export async function uploadWhiteboardImage(whiteboardId: string, file: File) {
  if (!isSupportedImage(file)) throw new Error("Only PNG, JPEG, GIF and WebP images can be added.");
  if (file.size > MAX_WHITEBOARD_IMAGE_BYTES) {
    throw new Error(`Images must be under ${MAX_WHITEBOARD_IMAGE_BYTES / (1024 * 1024)}MB.`);
  }
  const [natural, response] = await Promise.all([
    naturalSize(file),
    (() => {
      const body = new FormData();
      body.append("file", file);
      return fetch(`/api/whiteboards/${whiteboardId}/images`, { method: "POST", body });
    })(),
  ]);
  const json = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!response.ok || !json.id) throw new Error(json.error ?? "Upload failed.");
  return { attachmentId: json.id, natural };
}

// Editing chrome that must never appear in an exported image.
const EXCLUDED_CLASSES = ["react-flow__handle", "react-flow__resize-control", "react-flow__minimap", "react-flow__controls"];

/**
 * Renders the whole board (not just the visible part) to an image by
 * snapshotting React Flow's viewport element with a transform that fits
 * every node into `width` × `height`.
 */
export async function renderBoard(
  container: HTMLElement,
  nodes: WbNode[],
  { format, maxWidth, maxHeight, pixelRatio = 2 }: { format: "png" | "svg"; maxWidth: number; maxHeight: number; pixelRatio?: number },
) {
  const viewportEl = container.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewportEl || nodes.length === 0) return null;

  const bounds = getNodesBounds(nodes);
  const padding = 40;
  // Keep the board's aspect ratio, capped to the requested box.
  const scale = Math.min(maxWidth / (bounds.width + padding * 2), maxHeight / (bounds.height + padding * 2), 2);
  const width = Math.max(Math.round((bounds.width + padding * 2) * scale), 1);
  const height = Math.max(Math.round((bounds.height + padding * 2) * scale), 1);
  const viewport = getViewportForBounds(bounds, width, height, 0.01, 2, `${Math.round(padding * scale)}px`);

  const options = {
    backgroundColor: "#ffffff",
    width,
    height,
    pixelRatio,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
    filter: (el: HTMLElement) => !EXCLUDED_CLASSES.some((cls) => el.classList?.contains(cls)),
  };
  return format === "png" ? toPng(viewportEl, options) : toSvg(viewportEl, options);
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}

export async function dataUrlToBlob(dataUrl: string) {
  return (await fetch(dataUrl)).blob();
}
