"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
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

type FilterTab = "all" | "urgent" | "normal";

function daysUntilExpiry(expiry: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryLabel(expiry: string): { text: string; color: string } {
  const days = daysUntilExpiry(expiry);
  if (days < 0) return { text: "已過期", color: "text-red-500" };
  if (days === 0) return { text: "今天到期", color: "text-red-400" };
  if (days === 1) return { text: "明天到期", color: "text-red-400" };
  if (days <= 3) return { text: `${days}天後到期`, color: "text-yellow-400" };
  return { text: `${days}天後`, color: "text-gray-400" };
}

export default function FoodPage() {
  const { currentUser } = useUser();
  const { data: items, loading, refetch: fetchFood } = useCachedFetch<FoodItem[]>("/api/food", []);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [newFood, setNewFood] = useState({ name: "", quantity: "", unit: "個", expiry: "" });
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editFood, setEditFood] = useState({ name: "", quantity: "", unit: "個", expiry: "" });

  const filtered = items.filter((item) => {
    if (item["狀態"] !== "有效") return false;
    const days = daysUntilExpiry(item["過期日"]);
    if (filter === "urgent") return days <= 3;
    if (filter === "normal") return days > 3;
    return true;
  });

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

  const urgentCount = items.filter(i => i["狀態"] === "有效" && daysUntilExpiry(i["過期日"]) <= 3).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🧊 冰箱庫存</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          + 新增
        </button>
      </div>

      {showAdd && (
        <Card>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={newFood.name}
                onChange={(e) => setNewFood((p) => ({ ...p, name: e.target.value }))}
                placeholder="食品名稱"
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  value={newFood.quantity}
                  onChange={(e) => setNewFood((p) => ({ ...p, quantity: e.target.value }))}
                  placeholder="數量"
                  className="w-20 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <select
                  value={newFood.unit}
                  onChange={(e) => setNewFood((p) => ({ ...p, unit: e.target.value }))}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  {["個", "顆", "瓶", "包", "盒", "小罐", "g", "kg", "ml", "L"].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <input
                type="date"
                value={newFood.expiry}
                onChange={(e) => setNewFood((p) => ({ ...p, expiry: e.target.value }))}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={addFood}
                className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
              >
                確認新增
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="flex gap-2">
        {([
          ["all", "全部"],
          ["urgent", "即期"],
          ["normal", "正常"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === value ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {label}
            {value === "urgent" && urgentCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500/20 px-1.5 text-xs text-red-400">
                {urgentCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>庫存列表</CardTitle>
          <span className="text-xs text-gray-500">{filtered.length} 項</span>
        </CardHeader>
        {loading ? (
          <p className="text-sm text-gray-500">載入中...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500">沒有符合的食品項目</p>
        ) : (
          <div className="space-y-1">
            {filtered
              .sort((a, b) => new Date(a["過期日"]).getTime() - new Date(b["過期日"]).getTime())
              .map((item) => {
                const exp = expiryLabel(item["過期日"]);
                const sheetIndex = getSheetIndex(item);
                const isEditing = editIndex === sheetIndex;

                if (isEditing) {
                  return (
                    <div key={sheetIndex} className="rounded-lg bg-gray-800/50 px-3 py-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={editFood.name}
                          onChange={(e) => setEditFood((p) => ({ ...p, name: e.target.value }))}
                          className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-white focus:outline-none" placeholder="品名" />
                        <div className="flex gap-1">
                          <input type="number" value={editFood.quantity}
                            onChange={(e) => setEditFood((p) => ({ ...p, quantity: e.target.value }))}
                            className="w-16 rounded-lg border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-white focus:outline-none" />
                          <select value={editFood.unit}
                            onChange={(e) => setEditFood((p) => ({ ...p, unit: e.target.value }))}
                            className="rounded-lg border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-white focus:outline-none">
                            {["個", "顆", "瓶", "包", "盒", "小罐", "g", "kg", "ml", "L"].map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input type="date" value={editFood.expiry}
                          onChange={(e) => setEditFood((p) => ({ ...p, expiry: e.target.value }))}
                          className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-white focus:outline-none" />
                        <button onClick={saveEdit}
                          className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700">儲存</button>
                        <button onClick={() => setEditIndex(null)}
                          className="rounded-lg bg-gray-600 px-4 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-500">取消</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={sheetIndex}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-200">
                        {item["品名"]}
                        <span className="ml-2 text-gray-400">
                          {item["數量"]} {item["單位"]}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {item["新增者"]} 新增
                      </p>
                    </div>
                    <span className={`text-xs font-medium ${exp.color}`}>{exp.text}</span>
                    <div className="flex gap-3">
                      <button
                        onClick={() => startEdit(item, sheetIndex)}
                        className="rounded px-2 py-1 text-xs text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
                        title="編輯"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteFood(item["品名"])}
                        className="rounded px-2 py-1 text-xs text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        title="刪除"
                      >
                        ✕
                      </button>
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
