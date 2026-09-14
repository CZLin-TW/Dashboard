"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { colorPreview, wheelColor, wheelPosition, type LightColorState, type LightStateCommand } from "@/lib/light-color";

const RANGE_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];

export function LightColorControl({ name, value, total, disabled, onSend }: {
  name: string; value: LightColorState; total: number; disabled: boolean;
  onSend: (body: LightStateCommand) => Promise<void>;
}) {
  const white = value.temperature_count > 0 && value.min_kelvin !== null && value.max_kelvin !== null;
  const color = value.color_count > 0;
  const [choice, setChoice] = useState<"temperature" | "color" | null>(null);
  const mode = choice ?? (value.mode === "color" ? "color" : white ? "temperature" : "color");
  const [expanded, setExpanded] = useState(false);
  const [draftHS, setDraftHS] = useState<[number, number] | null>(null);
  const [draftK, setDraftK] = useState<number | null>(null);
  const pointer = useRef<number | null>(null);
  const gestureHS = useRef<[number, number] | null>(null);
  const pendingK = useRef<number | null>(null);
  // Fallbacks only position the editing controls. They are never claimed as readback.
  const hs: [number, number] = draftHS ?? value.hs ?? [0, 0];
  const kelvin = draftK ?? value.kelvin ?? Math.max(value.min_kelvin ?? 1000, Math.min(3000, value.max_kelvin ?? 10000));
  const status = value.mode === "mixed" ? "混合光色" : value.mode === "temperature" && value.kelvin
    ? `白光 · ${value.kelvin} K` : value.mode === "color" ? "彩色" : "光色未知";
  const count = mode === "color" ? value.color_count : value.temperature_count;

  async function sendHS(next: [number, number]) {
    if (disabled) return;
    gestureHS.current = null;
    await onSend({ hs_color: next });
    setDraftHS(null);
    setChoice(null);
  }

  async function sendKelvin() {
    const next = pendingK.current;
    pendingK.current = null;
    if (disabled || next === null) return;
    await onSend({ color_temp_kelvin: next });
    setDraftK(null);
    setChoice(null);
  }

  function updateWheel(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = wheelColor((event.clientX - rect.left - rect.width / 2) / (rect.width / 2),
      (event.clientY - rect.top - rect.height / 2) / (rect.height / 2));
    gestureHS.current = next;
    setDraftHS(next);
    return next;
  }

  if (!white && !color) return null;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-medium text-mute">光色 <span className="font-normal">· {status}</span></span>
      <div role="group" aria-label={`${name}光色模式`} className="inline-flex rounded-full bg-elevated p-[3px]">
        {(["temperature", "color"] as const).filter(item => item === "color" ? color : white).map(item =>
          <button key={item} type="button" disabled={disabled} aria-pressed={mode === item}
            onClick={() => { setChoice(item); setDraftHS(null); setDraftK(null); pendingK.current = null; }}
            className={`h-8 rounded-full px-3 text-[13px] disabled:opacity-40 ${mode === item ? "bg-cool text-white" : "text-mute"}`}>
            {item === "temperature" ? "白光" : "彩色"}
          </button>)}
      </div>
    </div>
    {count < total && <p className="text-xs text-mute">套用至支援{mode === "color" ? "彩色" : "色溫"}的 {count}／{total} 盞燈</p>}
    {mode === "temperature" && white ? <div className="space-y-2">
      <div className="flex justify-between text-xs text-mute"><span>暖白</span><span>{draftK !== null ? `${kelvin} K · 待套用` : value.mode === "temperature" && value.kelvin ? `${value.kelvin} K` : "拖動選擇色溫"}</span><span>冷白</span></div>
      <input type="range" aria-label={`${name}色溫`} min={value.min_kelvin!} max={value.max_kelvin!} step={1}
        value={Math.min(value.max_kelvin!, Math.max(value.min_kelvin!, kelvin))} disabled={disabled}
        onChange={event => { const next = Number(event.target.value); pendingK.current = next; setDraftK(next); }}
        onPointerUp={() => { void sendKelvin(); }} onBlur={() => { void sendKelvin(); }}
        onPointerCancel={() => { pendingK.current = null; setDraftK(null); }}
        onKeyUp={event => { if (RANGE_KEYS.includes(event.key)) void sendKelvin(); }}
        className="h-5 w-full cursor-pointer appearance-none rounded-full border border-line accent-cool disabled:opacity-40"
        style={{ background: "linear-gradient(to right, #ffb663, #fff5df, #d8e9ff)" }} />
    </div> : <div className="space-y-3">
      <button type="button" disabled={disabled} aria-expanded={expanded} aria-label={`${name}展開色盤`}
        onClick={() => setExpanded(!expanded)} className="flex h-[38px] w-full items-center gap-2 rounded-full border border-line bg-elevated px-3 text-[13px] text-soft disabled:opacity-40">
        <span className="h-5 w-5 rounded-full border border-line" style={{ background: value.hs || draftHS ? colorPreview(hs) : "linear-gradient(120deg,#ffc9c9,#d9d0ff,#c1eedc)" }} />
        {expanded ? "收合色盤" : "選擇顏色"}<ChevronDown className={`ml-auto h-4 w-4 ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && <div className="space-y-3 rounded-[14px] border border-line/60 bg-elevated/40 p-4">
        <div role="group" aria-label={`${name}二維色盤`} aria-disabled={disabled}
          onPointerDown={event => {
            if (disabled || !event.isPrimary || event.button !== 0) return;
            event.preventDefault(); pointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId); updateWheel(event);
          }}
          onPointerMove={event => { if (!disabled && pointer.current === event.pointerId) updateWheel(event); }}
          onPointerUp={event => {
            if (pointer.current !== event.pointerId) return;
            pointer.current = null;
            if (disabled) { setDraftHS(null); return; }
            const next = updateWheel(event);
            event.currentTarget.releasePointerCapture(event.pointerId);
            void sendHS(next);
          }}
          onPointerCancel={() => { pointer.current = null; gestureHS.current = null; setDraftHS(null); }}
          onLostPointerCapture={() => { if (pointer.current !== null) { pointer.current = null; gestureHS.current = null; setDraftHS(null); } }}
          className={`relative mx-auto aspect-square w-full max-w-52 touch-none rounded-full ${disabled ? "opacity-40" : "cursor-crosshair"}`}
          style={{ background: "radial-gradient(circle, white 0%, transparent 70.71%), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}>
          {(draftHS || value.hs) && <span className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#334155]" style={{ ...wheelPosition(hs), background: colorPreview(hs) }} />}
        </div>
        <p className="text-center text-xs text-mute">外圈選顏色，向中心調淡；放開套用</p>
        <div className="grid grid-cols-2 gap-3">
          {([0, 1] as const).map(index => <label key={index} className="space-y-1 text-xs text-mute">
            <span>{index === 0 ? "色相" : "濃淡"} · {hs[index]}{index === 0 ? "°" : "%"}</span>
            <input type="range" aria-label={`${name}${index === 0 ? "色相" : "飽和度"}`} min={0} max={index === 0 ? 360 : 100} step={1}
              value={hs[index]} disabled={disabled} className="h-5 w-full accent-cool"
              onChange={event => { const next: [number, number] = [...hs]; next[index] = Number(event.target.value); gestureHS.current = next; setDraftHS(next); }}
              onPointerUp={() => { if (gestureHS.current) void sendHS(gestureHS.current); }}
              onBlur={() => { if (gestureHS.current) void sendHS(gestureHS.current); }}
              onPointerCancel={() => { gestureHS.current = null; setDraftHS(null); }}
              onKeyUp={event => { if (RANGE_KEYS.includes(event.key) && gestureHS.current) void sendHS(gestureHS.current); }} />
          </label>)}
        </div>
      </div>}
    </div>}
  </div>;
}
