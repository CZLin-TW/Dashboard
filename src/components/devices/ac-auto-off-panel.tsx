"use client";
import { useEffect, useRef, useState } from "react";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { useUser } from "@/hooks/use-user";
import { ControlDetails, Field } from "@/components/ui/device-controls";
import { AUTO_OFF_STATUS, type AcAutoOffState } from "@/lib/ac-auto-off";

export function AcAutoOffPanel({ name }: { name: string }) {
  const { currentUser } = useUser();
  if (!currentUser || currentUser.role === "kid") return null;
  return <ControlDetails title="自動關機"><Settings name={name} /></ControlDetails>;
}

function Settings({ name }: { name: string }) {
  const { data, error, refetch } = useCachedFetch<{ devices: Record<string, AcAutoOffState> } | null>("/api/ac/auto-off", null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    void refetch();
    const timer = setInterval(() => { if (!document.hidden) void refetch(); }, 60_000);
    return () => clearInterval(timer);
  }, [refetch]);
  const live = data?.devices[name];
  if (!live) return <div className="text-xs text-mute"><p>{error ? "設定讀取失敗" : "讀取設定…"}</p>
    <button onClick={() => void refetch()} className="mt-2 text-cool">重新讀取</button></div>;
  const value = draft ?? String(live.hours);
  const valid = /^\d+$/.test(value) && Number(value) <= 168;
  async function save() {
    if (!valid || inFlight.current) return;
    inFlight.current = true; setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/ac/auto-off", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_name: name, hours: Number(value) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "設定保存未確認，請重新讀取");
      setDraft(null); setNotice("設定已保存");
    } catch (e) { setNotice(e instanceof Error ? e.message : "設定保存未確認，請重新讀取"); }
    finally { await refetch(); inFlight.current = false; setSaving(false); }
  }
  return <div className="space-y-3">
    <p className="text-xs leading-relaxed text-mute">開機後由管家計時，到時自動關閉。調溫、切換模式不會重新計時，手動關機排程優先。</p>
    <Field label="開機幾小時後關閉">
      <input aria-label={`${name}自動關機小時數`} type="number" inputMode="numeric" min={0} max={168} step={1}
        value={value} disabled={saving} onChange={e => { setDraft(e.target.value); setNotice(""); }}
        className="h-[38px] w-full min-w-0 rounded-full border border-line/70 bg-elevated px-3 text-base text-foreground" />
    </Field>
    <p className="text-xs text-mute">0 表示停用，可設 1–168 小時。開機中變更時數，會從保存後重新計時。</p>
    <p role="status" className="text-xs text-soft">{AUTO_OFF_STATUS[live.status] ?? "狀態未知"}{live.scheduled_at ? ` · 預計 ${live.scheduled_at} 關閉` : ""}</p>
    <button type="button" disabled={saving || !valid || Number(value) === live.hours} onClick={() => void save()}
      className="h-[38px] w-full rounded-full bg-cool px-3 text-[13px] font-medium text-white disabled:bg-elevated disabled:text-mute">
      {saving ? "保存中…" : "保存設定"}
    </button>
    {notice && <p role="status" className="text-xs text-soft">{notice}</p>}
    {error && <button onClick={() => void refetch()} className="text-xs text-warm">資料更新失敗，點此重新讀取</button>}
  </div>;
}
