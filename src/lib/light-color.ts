export interface LightColorState {
  color_count: number;
  temperature_count: number;
  min_kelvin: number | null;
  max_kelvin: number | null;
  mode: "color" | "temperature" | "mixed" | null;
  hs: [number, number] | null;
  kelvin: number | null;
}

export interface LightStateCommand {
  on?: boolean;
  brightness?: number;
  hs_color?: [number, number];
  color_temp_kelvin?: number;
}

// The wheel starts red at the top, clockwise, with white at its centre.
export function wheelColor(x: number, y: number): [number, number] {
  return [Math.round((Math.atan2(x, -y) * 180 / Math.PI + 360) % 360),
    Math.round(Math.min(1, Math.hypot(x, y)) * 100)];
}

export function wheelPosition([h, s]: [number, number]) {
  const angle = h * Math.PI / 180;
  return { left: `${50 + Math.sin(angle) * s / 2}%`, top: `${50 - Math.cos(angle) * s / 2}%` };
}

// HSV value is fixed at 100%; real bulb brightness has its own independent bar.
export function colorPreview([h, s]: [number, number]) {
  return `hsl(${h} 100% ${100 - s / 2}%)`;
}
