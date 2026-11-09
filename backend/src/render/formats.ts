export type FormatId = "feed_4x5" | "story_9x16" | "square_1x1" | "landscape_16x9" | "print_18x24";

export interface Format {
  id: FormatId;
  label: string;
  /** CSS layout size in px */
  width: number;
  height: number;
  /** device scale factor used when rasterising */
  scale: number;
  /** Instagram UI safe-zone insets (px, layout space) */
  safe: { top: number; bottom: number; side: number };
}

export const FORMATS: Record<FormatId, Format> = {
  feed_4x5: { id: "feed_4x5", label: "Feed 4:5 · 1080×1350", width: 1080, height: 1350, scale: 1, safe: { top: 60, bottom: 60, side: 64 } },
  story_9x16: { id: "story_9x16", label: "Story / Reel 9:16 · 1080×1920", width: 1080, height: 1920, scale: 1, safe: { top: 250, bottom: 340, side: 72 } },
  square_1x1: { id: "square_1x1", label: "Square 1:1 · 1080×1080", width: 1080, height: 1080, scale: 1, safe: { top: 56, bottom: 56, side: 64 } },
  landscape_16x9: { id: "landscape_16x9", label: "Landscape 16:9 · 1920×1080 (screens / email / web)", width: 1920, height: 1080, scale: 1, safe: { top: 64, bottom: 64, side: 96 } },
  // 18x24in at 300dpi = 5400x7200. Lay out at 1350x1800 and rasterise at 4x.
  print_18x24: { id: "print_18x24", label: "Print poster 18×24 in · 300 dpi", width: 1350, height: 1800, scale: 4, safe: { top: 90, bottom: 90, side: 90 } },
};

export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];

export function publicFormat(f: Format) {
  return { id: f.id, label: f.label, width: f.width * f.scale, height: f.height * f.scale };
}
