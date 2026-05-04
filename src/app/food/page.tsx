"use client";

import { useState } from "react";
import { Apple, Plus, Pencil, X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  PillButton,
  IconActionButton,
} from "@/components/ui/device-controls";
import { foodUrgency, urgencyRowClass } from "@/lib/types";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";

interface FoodItem {
  "品名": string;
  "數量": string;
  "單位": string;
  "過期日": string;
  "新增日": string;
  "新增者": string;
  "狀態": string;
}

const UNITS = ["個", "顆", "瓶", "包", "盒", "小罐", "g", "kg", "ml", "L"];

const INPUT_BASE =
  "rounded-[10px] border border-line bg-elevated px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-cool focus:outline-none";

function daysUntilExpiry(expiry: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryLabel(expiry: string): { text: string; cls: string } {
  const days = daysUntilExpiry(expiry);
  if (days < 0) return { text: "已過期", cls: "text-warm font-semibold" };
  if (days === 0) return { text: "今天到期", cls: "text-warm font-semibold" };
  if (days === 1) return { text: "明天到期", cls: "text-warm font-semibold" };
  if (days <= 3) return { text: `${days} 天後到期`, cls: "text-warm font-semibold" };
  return { text: `${days} 天後`, cls: "text-mute" };
}

export default function FoodPage() {
  const { currentUser } = useUser();
  const { data: items, loading, refetch: fetchFood } = useCachedFetch<FoodItem[]>("/api/food", []);
  const [showAdd, setShowAdd] = useState(false);
  const [newFood, setNewFood] = useState({ name: "", quantity: "", unit: "個", expiry: "" });
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editFood, setEditFood] = useState({ name: "", quantity: "", unit: "個", expiry: "" });

  const filtered = items
    .filter((item) => item["狀態"] === "有效")
    .sort((a, b) => new Date(a["過期日"]).getTime() - new Date(b["過期日"]).getTime());

  function addFood() {
    if (!newFood.name.trim() || !newFood.expiry || !currentUser) return;
    fetch("/api/food", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFood.name.trim(),
        quantity: Number(newFood.quantity) || 1,
        unit: newFood.unit,
        expiry: newFood.expiry,
        person: currentUser.name,
      }),
    }).then(() => {
      setNewFood({ name: "", quantity: "", unit: "個", expiry: "" });
      setShowAdd(false);
      fetchFood();
    });
  }

  function deleteFood(name: string) {
    if (!confirm(`確定要刪除「${name}」嗎？`)) return;
    fetch(`/api/food?name=${encodeURIComponent(name)}`, { method: "DELETE" }).then(() => fetchFood());
  }

  function startEdit(item: FoodItem, sheetIndex: number) {
    setEditIndex(sheetIndex);
    setEditFood({
      name: item["品名"],
      quantity: item["數量"],
      unit: item["單位"],
      expiry: item["過期日"],
    });
  }

  function saveEdit() {
    if (editIndex === null) return;
    const original = items[editIndex];
    fetch("/api/food", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: original["品名"],
        name_new: editFood.name !== original["品名"] ? editFood.name : undefined,
        quantity: editFood.quantity !== original["數量"] ? Number(editFood.quantity) : undefined,
        unit: editFood.unit !== original["單位"] ? editFood.unit : undefined,
        expiry: editFood.expiry !== original["過期日"] ? editFood.expiry : undefined,
      }),
    }).then(() => {
      setEditIndex(null);
      fetchFood();
    });
  }

  function getSheetIndex(item: FoodItem): number {
    return items.indexOf(item);
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

      {showAdd && (
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
              className="w-full rounded-full bg-fresh px-5 py-2.5 text-sm font-semibold text-white hover:bg-fresh/85 disabled:bg-elevated disabled:text-mute transition-colors"
            >
              確認新增
            </button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>庫存列表</CardTitle>
          <span className="num text-xs text-mute">{filtered.length} 項</span>
        </CardHeader>
        {loading ? (
          <p className="text-sm text-mute">載入中...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-mute">沒有符合的食品項目</p>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((item) => {
              const exp = expiryLabel(item["過期日"]);
              const sheetIndex = getSheetIndex(item);
              const isEditing = editIndex === sheetIndex;

              if (isEditing) {
                return (
                  <div
                    key={sheetIndex}
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
                        onClick={saveEdit}
                        className="rounded-full bg-fresh px-4 py-1.5 text-xs font-semibold text-white hover:bg-fresh/85"
                      >
                        儲存
                      </button>
                      <button
                        onClick={() => setEditIndex(null)}
                        className="rounded-full border border-line bg-elevated px-4 py-1.5 text-xs font-medium text-soft hover:bg-elevated/80"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                );
              }

              const urgency = foodUrgency(item["過期日"]);
              const urgencyCls = urgencyRowClass(urgency);
              const hoverCls = urgencyCls ? "" : "hover:bg-elevated/50";

              return (
                <div
                  key={sheetIndex}
                  className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors ${urgencyCls} ${hoverCls}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">{item["品名"]}</span>
                      <span className="num ml-2 text-mute">
                        {item["數量"]} {item["單位"]}
                      </span>
                    </p>
                    <p className="text-xs text-mute">{item["新增者"]} 新增</p>
                  </div>
                  <span className={`num flex-shrink-0 text-xs ${exp.cls}`}>{exp.text}</span>
                  <div className="flex items-center gap-1">
                    <IconActionButton
                      onClick={() => startEdit(item, sheetIndex)}
                      title="編輯"
                      icon={<Pencil className="h-3.5 w-3.5" strokeWidth={2} />}
                    />
                    <IconActionButton
                      onClick={() => deleteFood(item["品名"])}
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
