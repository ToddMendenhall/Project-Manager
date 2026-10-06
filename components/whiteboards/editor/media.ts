import { toPng, toSvg } from "html-to-image";
import { getNodesBounds, getViewportForBounds } from "@xyflow/react";
import { MAX_WHITEBOARD_IMAGE_BYTES, WHITEBOARD_IMAGE_TYPES } from "@/lib/whiteboard";
import type { WbNode } from "./model";

export function isSupportedImage(file: File) {
  return (WHITEBOARD_IMAGE_TYPES as readonly string[]).includes(file.type);
}

function loadImage(file: File): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Longest side, in pixels, an uploaded image is scaled down to. Plenty for a canvas item, even zoomed in. */
const MAX_IMAGE_SIDE = 2000;
/** Files already this small and within MAX_IMAGE_SIDE are uploaded untouched. */
const SHRINK_ABOVE_BYTES = 300 * 1024;
const REENCODE_QUALITY = 0.85;

/**
 * Downscales and re-encodes an image in the browser before upload. Image
 * bytes live in Postgres and are counted against the database's storage
 * and transfer quotas, and a typical screenshot shrinks 5-10x as WebP at
 * this size and quality. GIFs pass through unchanged (re-encoding would
 * drop animation), and the original is kept whenever re-encoding doesn't
 * make the file smaller, or the browser can't encode WebP.
 */
async function shrinkImage(file: File): Promise<{ file: File; width: number; height: number }> {
  const img = await loadImage(file);
  const width = img?.naturalWidth || 300;
  const height = img?.naturalHeight || 200;
  if (!img || file.type === "image/gif") return { file, width, height };

  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  if (scale === 1 && file.size <= SHRINK_ABOVE_BYTES) return { file, width, height };

  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { file, width, height };
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, outWidth, outHeight);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", REENCODE_QUALITY));
  // Browsers without WebP encoding hand back a PNG instead, which is rarely smaller — keep the original then.
  if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return { file, width, height };
  const name = `${file.name.replace(/\.[^.]+$/, "") || "image"}.webp`;
  return { file: new File([blob], name, { type: "image/webp" }), width: outWidth, height: outHeight };
}

/** Uploads an image for the board (the route stores it as an attachment) and returns its id and size. */
export async function uploadWhiteboardImage(whiteboardId: string, original: File) {
  if (!isSupportedImage(original)) throw new Error("Only PNG, JPEG, GIF and WebP images can be added.");
  const { file, width, height } = await shrinkImage(original);
  // Checked after shrinking, so a large photo that compresses under the limit is still accepted.
  if (file.size > MAX_WHITEBOARD_IMAGE_BYTES) {
    throw new Error(`Images must be under ${MAX_WHITEBOARD_IMAGE_BYTES / (1024 * 1024)}MB.`);
  }
  const natural = { width, height };
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`/api/whiteboards/${whiteboardId}/images`, { method: "POST", body });
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
