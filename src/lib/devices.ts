// The devices page's data, shaped for the cards and charts. HomeButler sends one page (DevicesPage)
// and the history separately (History); this turns them into one list of devices and the chart series.

import { AirVent, Droplets, Fan, Thermometer, type LucideIcon } from "lucide-react";
import type { Ac, Computer, Dehumidifier, DevicesPage, History, Ir, SensorNow } from "./api";
import type { SensorHistoryRaw } from "./sensor";
import type { AcSegment } from "./ac";
import type { DehumOnSegment } from "./dehumidifier";
import type { ComputerHistoryRaw, ComputerPC } from "./computer";
import type { HaAutomationLog, HaSnapshot } from "./home-assistant";

export type DeviceKind = "ac" | "ir" | "dehumidifier" | "sensor";

export type UiDevice =
  | { kind: "ac"; name: string; location: string; ac: Ac }
  | { kind: "ir"; name: string; location: string; ir: Ir }
  | { kind: "dehumidifier"; name: string; location: string; dehumidifier: Dehumidifier }
  | { kind: "sensor"; name: string; location: string; sensor: SensorNow };

export const KIND_LABEL: Record<DeviceKind, string> = { ac: "空調", ir: "IR", dehumidifier: "除濕機", sensor: "感應器" };
export const KIND_ICON: Record<DeviceKind, LucideIcon> = { ac: AirVent, ir: Fan, dehumidifier: Droplets, sensor: Thermometer };

export function devicesOf(page: DevicesPage | null): UiDevice[] {
  if (!page) return [];
  return [
    ...page.acs.map((ac) => ({ kind: "ac" as const, name: ac.name, location: ac.location, ac })),
    ...(page.dehumidifiers ?? []).map((d) => ({ kind: "dehumidifier" as const, name: d.name, location: d.location, dehumidifier: d })),
    ...page.irs.map((ir) => ({ kind: "ir" as const, name: ir.name, location: ir.location, ir })),
    ...page.sensors.map((sensor) => ({ kind: "sensor" as const, name: sensor.name, location: sensor.location, sensor })),
  ];
}

const seconds = (iso: string) => Date.parse(iso) / 1000;

export function sensorHistory(history: History | null, name: string): SensorHistoryRaw[] {
  return (history?.sensors[name] ?? []).map((p) => ({ t: seconds(p.t), temp: p.temperature, humidity: p.humidity, co2: p.co2 }));
}

/** On-periods of every AC in this location, for a sensor chart's background. */
export function acSegments(history: History | null, page: DevicesPage | null, location: string): AcSegment[] {
  if (!history || !page || !location) return [];
  const out: AcSegment[] = [];
  for (const ac of page.acs.filter((a) => a.location === location)) {
    let current: AcSegment | null = null;
    for (const p of history.acs[ac.name] ?? []) {
      const t = Date.parse(p.t);
      if (p.power === "on") {
        if (!current) current = { startT: t, endT: t, mode: p.mode };
        else { current.endT = t; if (p.mode) current.mode = p.mode; }
      } else if (current) { out.push(current); current = null; }
    }
    if (current) out.push(current);
  }
  return out;
}

export function dehumidifierSegments(history: History | null, name: string): DehumOnSegment[] {
  const out: DehumOnSegment[] = [];
  let current: DehumOnSegment | null = null;
  for (const p of history?.dehumidifiers[name] ?? []) {
    const t = Date.parse(p.t);
    if (p.power === "on") {
      if (!current) current = { startT: t, endT: t };
      else current.endT = t;
    } else if (current) { out.push(current); current = null; }
  }
  if (current) out.push(current);
  return out;
}

export function dehumidifierSegmentsAt(history: History | null, page: DevicesPage | null, location: string): DehumOnSegment[] {
  if (!location) return [];
  return (page?.dehumidifiers ?? []).filter((d) => d.location === location).flatMap((d) => dehumidifierSegments(history, d.name));
}

/** A computer as the card expects it: its latest report, and its history. */
export function computerOf(computer: Computer, history: History | null): ComputerPC {
  const points = (history?.computers[String(computer.id)] ?? []).map((p): ComputerHistoryRaw => ({
    t: seconds(String(p.t)), cpu_pct: p.cpu_pct as number | null, ram_pct: p.ram_pct as number | null, gpu_pct: p.gpu_pct as number | null,
    cpu_temp_c: p.cpu_temp as number | null, gpu_temp_c: p.gpu_temp as number | null,
    smc_temperature: p.soc_temp == null ? null : { tcmb_c: p.soc_temp as number, tcmz_c: null },
    memory_pressure: p.mem_pressure_pct == null && p.mem_pressure_level == null ? null
      : { level: (p.mem_pressure_level ?? null) as "normal" | "warning" | "critical" | null, pct: p.mem_pressure_pct as number | null },
    system_power_w: p.power_w as number | null,
  }));
  return {
    ip: computer.ip, hostname: computer.hostname, cpu_model: computer.cpu_model, gpu_model: computer.gpu_model,
    current: computer.current as unknown as ComputerPC["current"], history: points,
    last_heartbeat_at: computer.last_heartbeat_at ? seconds(computer.last_heartbeat_at) : 0, online: computer.online,
  };
}

export function presenceOf(page: DevicesPage | null): HaSnapshot | null {
  if (!page || !page.presence) return null;
  const ha = page.home_assistant;
  return { configured: true, connected: ha.connected, online: ha.online, received_at: ha.received_at, age_seconds: ha.age_seconds,
    stale_after_seconds: ha.stale_after_seconds, observations: page.presence as unknown as HaSnapshot["observations"],
    zone_editor: page.zone_editor };
}

export function automationsOf(page: DevicesPage | null): HaAutomationLog | null {
  if (!page) return null;
  return { configured: true, ...page.automations } as unknown as HaAutomationLog;
}

/** A value from an Ac's label (冷氣) back to the option value (cool) the command takes. */
export function optionValue(options: { value: string; label: string }[], label: string | null): string {
  return options.find((o) => o.label === label || o.value === label)?.value ?? "";
}
