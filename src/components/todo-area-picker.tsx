"use client";

import type { LightAreaChoice } from "@/lib/api";

export function TodoAreaPicker({ areas, selected, onChange }: {
  areas: LightAreaChoice[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const choices = [
    ...areas.map(area => ({ id: area.id, name: area.name })),
    ...selected.filter(id => !areas.some(area => area.id === id)).map(id => ({ id, name: "原區域（目前不可用）" })),
  ];
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-xs font-medium text-mute">提醒區域（可複選）</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map(area => (
          <label key={area.id} className="flex min-h-[38px] max-w-full cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-elevated px-3 py-2 text-sm">
            <input type="checkbox" checked={selected.includes(area.id)}
              onChange={event => onChange(event.target.checked
                ? [...selected, area.id] : selected.filter(id => id !== area.id))}
              className="h-4 w-4 shrink-0 accent-cool" />
            <span className="break-words">{area.name}</span>
          </label>
        ))}
      </div>
      {choices.length === 0 && <p className="text-xs text-mute">尚未取得照明區域</p>}
      {selected.length === 0 && <p className="text-xs text-amber" role="status">請至少選擇一個提醒區域</p>}
    </fieldset>
  );
}
