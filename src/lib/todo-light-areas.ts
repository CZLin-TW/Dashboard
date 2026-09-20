/** The existing Sheet cell is a single ID, or a JSON array for multiple targets. */
export function todoLightAreaIds(todo: { "燈光區域ID"?: string }, defaultId = ""): string[] {
  const cell = (todo["燈光區域ID"] || "").trim();
  if (!cell) return defaultId ? [defaultId] : [];
  if (!cell.startsWith("[")) return [cell];
  try {
    const value: unknown = JSON.parse(cell);
    if (!Array.isArray(value) || value.some(id => typeof id !== "string" || !id.trim())) return [];
    return [...new Set((value as string[]).map(id => id.trim()))];
  } catch { return []; }
}

export function sameAreaIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every(id => b.includes(id));
}

export function encodeLightAreaIds(ids: string[]): string {
  const unique = [...new Set(ids.map(id => id.trim()))];
  return unique.length > 1 ? JSON.stringify(unique) : unique[0] || "";
}
