export interface AcFeedbackConfig {
  enabled: boolean;
  sensor_name: string;
  interval_min: number;
  tolerance: number;
  step: number;
  min_adjust_min: number;
  max_offset: number;
}
export const AC_FEEDBACK_DEFAULTS: AcFeedbackConfig = {
  enabled: false, sensor_name: "", interval_min: 5, tolerance: 0.5,
  step: 1, min_adjust_min: 10, max_offset: 3,
};
export interface AcFeedbackState {
  config: AcFeedbackConfig;
  status: string;
  sensor_temperature: number | null;
  target_temperature: number | null;
  ir_temperature: number | null;
  last_adjusted_at?: number | null;
  next_evaluation_at?: number | null;
}
export interface AcFeedbackResponse {
  devices: Record<string, AcFeedbackState>;
  sensors: { name: string; location: string }[];
}
export const AC_FEEDBACK_STATUS: Record<string, string> = {
  disabled: "回饋已停用", waiting_power: "空調關閉，等待運轉", waiting_mode: "目前模式不補償",
  unconfirmed: "指令未確認，請檢查空調並手動送出設定後再恢復",
  needs_manual: "請先用面板送出完整空調設定", sensor_stale: "感測器離線或資料過期，暫停調整",
  waiting_sample: "等待新的溫度讀值", settling: "等待空調反應", stable: "溫度在容許範圍，保持補償",
  at_limit: "已達補償上限", adjusting: "準備調整", compensating: "補償中",
};
