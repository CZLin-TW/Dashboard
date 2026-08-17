// 劇院 agent（theater-agent repo，跑在 XEON PC 上）的 summary payload 型別。
// backend 來源：home-butler /api/theater/summary → PC agent 轉送 → theater_agent.py /summary。
// agent_id = PC hostname，devices 頁用它把劇院區塊掛到對應的 ComputerCard。

export interface TheaterFlags {
  kef_link: boolean;        // AVR ↔ KEF 喇叭自動連動
  tv_screen_auto: boolean;  // Apple TV 播音樂 → Bravia 螢幕自動關閉
  tv_avr_sync: boolean;     // 電視從待機開啟 → 搶先開啟 AVR
}

export type TheaterFlagKey = keyof TheaterFlags;

export interface TheaterDeviceStatus {
  power?: string;
  source?: string;
  volume?: number | string;
  error?: string;
}

export interface TheaterSummary {
  agent_id: string;
  flags: TheaterFlags;
  monitor?: {
    last_avr_state?: string;
    last_tv_state?: string;
    agent_sha?: string;
    auto_update?: boolean;
  };
  devices?: {
    marantz?: TheaterDeviceStatus;
    ls60?: TheaterDeviceStatus;
    lsx2?: TheaterDeviceStatus;
  };
  logs?: {
    theater?: string[];
    appletv?: string[];
  };
}

/** monitor.last_tv_state / last_avr_state 的顯示文字。agent 端沒觀測到時是 "unknown"。 */
export const THEATER_TV_STATE_LABELS: Record<string, string> = {
  active: "開機",
  standby: "待機",
};

export const THEATER_AVR_STATE_LABELS: Record<string, string> = {
  on: "開機",
  off: "待機",
};

export const THEATER_FLAG_LABELS: Record<TheaterFlagKey, { title: string; description: string }> = {
  kef_link: {
    title: "KEF 喇叭自動連動",
    description: "AVR 開關時同步喚醒／關閉 LS60＋LSX II",
  },
  tv_screen_auto: {
    title: "電視畫面自動關閉",
    description: "Apple TV 播音樂時關閉 Bravia 螢幕",
  },
  tv_avr_sync: {
    title: "AVR 自動隨電視開啟",
    description: "電視從待機開啟時搶先開啟 Marantz",
  },
};
