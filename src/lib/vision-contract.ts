/** Phase 1 contract. Synthetic UI data never represents a connected camera/model. */
export interface VisionCapabilities { status: boolean; preview: boolean; edit: boolean }
export type VisionModel = "yolo11n" | "yolo11s";
export type VisionPrecision = "fp16" | "fp32";
export interface VisionConfig { revision: number; model: VisionModel; precision: VisionPrecision }
export interface VisionStatus extends VisionConfig {
  source: "synthetic" | "unavailable";
  online: boolean;
  reason: string;
  capabilities: VisionCapabilities;
}
export interface VisionPreview { source: "synthetic"; label: string }
export interface VisionTransport {
  access(signal?: AbortSignal): Promise<VisionCapabilities>;
  status(signal?: AbortSignal): Promise<VisionStatus>;
  config(signal?: AbortSignal): Promise<VisionConfig>;
  save(config: VisionConfig, signal?: AbortSignal): Promise<VisionConfig>;
  preview(signal?: AbortSignal): Promise<VisionPreview>;
}
