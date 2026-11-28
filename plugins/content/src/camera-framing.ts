export const DEFAULT_MOVE_MS = 1200;
export const FRAMING = {
  overview: { pad: 128, zoom: 1.25, ms: 1400 },
  medium: { pad: 64, zoom: 2, ms: DEFAULT_MOVE_MS },
  detail: { pad: 16, zoom: 4, ms: 900 },
} as const;
