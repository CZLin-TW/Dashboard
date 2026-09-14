export interface AcAutoOffState {
  hours: number;
  status: string;
  scheduled_at: string | null;
}

export const AUTO_OFF_STATUS: Record<string, string> = {
  disabled: "已停用", unavailable: "HA 狀態未知，等待恢復",
  waiting_power: "等待下次開機", waiting_observation: "等待下一次狀態檢查",
  counting: "計時中", manual_priority: "以手動關機排程為準",
  needs_review: "執行結果需確認，不會自動重送", completed: "本次已執行",
  expired: "本次已過期，不會補送", cancelled: "本次已取消",
};
