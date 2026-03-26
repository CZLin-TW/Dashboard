"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";

interface FoodItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expiry: string;
  addedBy: string;
  status: string;
}

const mockFood: FoodItem[] = [
  { id: "1", name: "牛奶", quantity: 1, unit: "瓶", expiry: "2026-03-27", addedBy: "使用者 1", status: "即期" },
  { id: "2", name: "雞蛋", quantity: 6, unit: "顆", expiry: "2026-03-28", addedBy: "使用者 2", status: "即期" },
  { id: "3", name: "高麗菜", quantity: 1, unit: "顆", expiry: "2026-03-29", addedBy: "使用者 2", status: "正常" },
  { id: "4", name: "豬肉片", quantity: 300, unit: "g", expiry: "2026-04-05", addedBy: "使用者 1", status: "正常" },
  { id: "5", name: "吐司", quantity: 1, unit: "包", expiry: "2026-04-01", addedBy: "使用者 1", status: "正常" },
  { id: "6", name: "醬油", quantity: 1, unit: "瓶", expiry: "2026-12-01", addedBy: "使用者 2", status: "正常" },
];

type FilterTab = "all" | "urgent" | "normal";

function daysUntilExpiry(expiry: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiry);
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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
  const [items, setItems] = useState(mockFood);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [newFood, setNewFood] = useState({ name: "", quantity: "", unit: "個", expiry: "" });

  const filtered = items.filter((item) => {
    if (filter === "urgent") return daysUntilExpiry(item.expiry) <= 3;
    if (filter === "normal") return daysUntilExpiry(item.expiry) > 3;
    return true;
  });

  function addFood() {
    if (!newFood.name.trim() || !newFood.expiry || !currentUser) return;
    const item: FoodItem = {
      id: Date.now().toString(),
      name: newFood.name.trim(),
      quantity: Number(newFood.quantity) || 1,
      unit: newFood.unit,
      expiry: newFood.expiry,
      addedBy: currentUser.name,
      status: "正常",
    };
    setItems((prev) => [...prev, item]);
    setNewFood({ name: "", quantity: "", unit: "個", expiry: "" });
    setShowAdd(false);
  }

  function deleteFood(id: string) {
    setItems((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🧳 冰箱庫存</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          + 新增
        </button>
      </div>

      {/* Add Form */}
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
                  {["個", "顆", "瓶", "包", "盒", "g", "kg", "ml", "L"].map((u) => (
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

      {/* Filter */}
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
            {value === "urgent" && (
              <span className="ml-1.5 rounded-full bg-red-500/20 px-1.5 text-xs text-red-400">
                {items.filter((i) => daysUntilExpiry(i.expiry) <= 3).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Food List */}
      <Card>
        <CardHeader>
          <CardTitle>庫存列表</CardTitle>
          <span className="text-xs text-gray-500">{filtered.length} 項</span>
        </CardHeader>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500">沒有符合的食品項目</p>
        ) : (
          <div className="space-y-1">
            {filtered
              .sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime())
              .map((item) => {
                const exp = expiryLabel(item.expiry);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-200">
                        {item.name}
                        <span className="ml-2 text-gray-400">
                          {item.quantity} {item.unit}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.addedBy} 新增
                      </p>
                    </div>
                    <span className={`text-xs font-medium ${exp.color}`}>{exp.text}</span>
                    <button
                      onClick={() => deleteFood(item.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
          </div>
        )}
      </Card>
    </div>
  );
}
