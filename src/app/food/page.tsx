"use client";

import { useState } from "react";
import { Apple, Plus, Pencil, X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapse } from "@/components/ui/collapse";
import {
  Field,
  PillButton,
  IconActionButton,
} from "@/components/ui/device-controls";
import { expiryLabel, foodUrgency, urgencyRowClass } from "@/lib/types";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { HB, send, type Food } from "@/lib/api";

const UNITS = ["個", "顆", "瓶", "包", "盒", "小罐", "g", "kg", "ml", "L"];

const INPUT_BASE =
  "rounded-[10px] border border-line bg-elevated px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-cool focus:outline-none";

export default function FoodPage() {
  const { data, loading, hasData, refetch: fetchFood } = useCachedFetch<{ food: Food[] }>(HB("food"), { food: [] });
  const [showAdd, setShowAdd] = useState(false);
  const [newFood, setNewFood] = useState({ name: "", quantity: "", unit: "個", expiry: "" });
  const [editing, setEditing] = useState<number | null>(null);
  const [editFood, setEditFood] = useState({ name: "", quantity: "", unit: "個", expiry: "" });
  const [problem, setProblem] = useState<string | null>(null);

  const filtered = [...data.food].sort((a, b) => (a.expires_on ?? "9999").localeCompare(b.expires_on ?? "9999"));

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setProblem(null);
    try {
      await action();
      after?.();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "操作失敗，請稍後重試。");
    } finally {
      await fetchFood();
    }
  }

  function addFood() {
    if (!newFood.name.trim() || !newFood.expiry) return;
    void run(() => send("POST", "food", { name: newFood.name.trim(), quantity: Number(newFood.quantity) || 1, unit: newFood.unit,
      expires_on: newFood.expiry }), () => { setNewFood({ name: "", quantity: "", unit: "個", expiry: "" }); setShowAdd(false); });
  }

  function deleteFood(item: Food) {
    if (!confirm(`確定要刪除「${item.name}」嗎？`)) return;
    void run(() => send("DELETE", `food/${item.id}`));
  }

  function startEdit(item: Food) {
    setEditing(item.id);
    setEditFood({ name: item.name, quantity: String(item.quantity), unit: item.unit, expiry: item.expires_on ?? "" });
  }

  function saveEdit(item: Food) {
    const changes = {
      name: editFood.name !== item.name ? editFood.name : undefined,
      quantity: editFood.quantity !== String(item.quantity) ? Number(editFood.quantity) : undefined,
      unit: editFood.unit !== item.unit ? editFood.unit : undefined,
      expires_on: editFood.expiry !== (item.expires_on ?? "") ? editFood.expiry : undefined,
    };
    void run(() => send("PATCH", `food/${item.id}`, changes), () => setEditing(null));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.01em]">
          <Apple className="h-5 w-5 text-mute" strokeWidth={2} />
          庫存
        </h1>
        <PillButton
          onClick={() => setShowAdd(!showAdd)}
          icon={<Plus className="h-4 w-4" strokeWidth={2.5} />}
        >
          新增
        </PillButton>
      </div>

      <Collapse open={showAdd}>
        <Card>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newFood.name}
                onChange={(e) => setNewFood((p) => ({ ...p, name: e.target.value }))}
                placeholder="食品名稱"
                className={`flex-1 min-w-0 ${INPUT_BASE}`}
              />
              <input
                type="number"
                value={newFood.quantity}
                onChange={(e) => setNewFood((p) => ({ ...p, quantity: e.target.value }))}
                placeholder="數量"
                className={`w-20 num ${INPUT_BASE}`}
              />
              <select
                value={newFood.unit}
                onChange={(e) => setNewFood((p) => ({ ...p, unit: e.target.value }))}
                className={`field-select w-24 ${INPUT_BASE}`}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <Field label="過期日 *">
              <input
                type="date"
                value={newFood.expiry}
                onChange={(e) => setNewFood((p) => ({ ...p, expiry: e.target.value }))}
                className={`w-full ${INPUT_BASE}`}
              />
            </Field>
            <button
              onClick={addFood}
              disabled={!newFood.name.trim() || !newFood.expiry}
              className="w-full rounded-full bg-cool px-5 py-2.5 text-sm font-semibold text-white hover:bg-cool/85 disabled:bg-elevated disabled:text-mute transition-colors"
            >
              確認新增
            </button>
          </div>
        </Card>
      </Collapse>

      {problem && <p role="alert" className="rounded-[12px] bg-warm-bg/70 px-3 py-2 text-sm text-warm">{problem}</p>}

      <Card>
        <CardHeader>
          <CardTitle>庫存列表</CardTitle>
          <span className="num text-xs text-mute">{hasData ? `${filtered.length} 項` : "—"}</span>
        </CardHeader>
        {loading && !hasData ? (
          <p className="text-sm text-mute">載入中...</p>
        ) : !hasData ? (
          <p className="text-sm text-mute">尚未取得食品資料，請重新讀取。</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-mute">沒有符合的食品項目</p>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((item) => {
              const exp = expiryLabel(item.expires_on ?? "");
              const isEditing = editing === item.id;

              if (isEditing) {
                return (
                  <div
                    key={item.id}
                    className="rounded-[12px] bg-elevated/50 px-3 py-3 space-y-2.5"
                  >
                    {/* Row 1：品名（全寬） */}
                    <input
                      type="text"
                      value={editFood.name}
                      onChange={(e) => setEditFood((p) => ({ ...p, name: e.target.value }))}
                      placeholder="品名"
                      className={`w-full ${INPUT_BASE}`}
                    />
                    {/* Row 2：過期日 + 數量 + 單位 */}
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={editFood.expiry}
                        onChange={(e) => setEditFood((p) => ({ ...p, expiry: e.target.value }))}
                        className={`flex-1 min-w-0 ${INPUT_BASE}`}
                      />
                      <input
                        type="number"
                        value={editFood.quantity}
                        onChange={(e) => setEditFood((p) => ({ ...p, quantity: e.target.value }))}
                        className={`w-16 num ${INPUT_BASE}`}
                      />
                      <select
                        value={editFood.unit}
                        onChange={(e) => setEditFood((p) => ({ ...p, unit: e.target.value }))}
                        className={`field-select w-24 ${INPUT_BASE}`}
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Row 3：儲存 / 取消 */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(item)}
                        className="rounded-full bg-cool px-4 py-1.5 text-xs font-semibold text-white hover:bg-cool/85"
                      >
                        儲存
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded-full border border-line bg-elevated px-4 py-1.5 text-xs font-medium text-soft hover:bg-elevated/80"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                );
              }

              const urgency = foodUrgency(item.expires_on ?? "");
              const urgencyCls = urgencyRowClass(urgency);
              const hoverCls = urgencyCls ? "" : "hover:bg-elevated/50";

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors ${urgencyCls} ${hoverCls}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">{item.name}</span>
                      <span className="num ml-2 text-mute">
                        {item.quantity} {item.unit}
                      </span>
                    </p>
                    {item.added_by && <p className="text-xs text-mute">{item.added_by} 新增</p>}
                  </div>
                  <span className={`num flex-shrink-0 text-xs ${exp.cls}`}>{exp.text}</span>
                  <div className="flex items-center gap-1">
                    <IconActionButton
                      onClick={() => startEdit(item)}
                      title="編輯"
                      icon={<Pencil className="h-3.5 w-3.5" strokeWidth={2} />}
                    />
                    <IconActionButton
                      onClick={() => deleteFood(item)}
                      tone="danger"
                      title="刪除"
                      icon={<X className="h-3.5 w-3.5" strokeWidth={2} />}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
