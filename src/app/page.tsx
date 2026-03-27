"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { useState } from "react";

interface WeatherData {
  location: string;
  city: string;
  date_label: string;
  date: string;
  wx: string;
  min_t: number | null;
  max_t: number | null;
  min_at: number | null;
  max_at: number | null;
  pop: number | null;
}

interface DeviceData {
  name: string;
  type: string;
  temperature?: number;
  humidity?: number;
  power?: boolean;
  mode?: string;
  targetHumidity?: string;
  buttons?: string;
}

interface TodoData {
  "事項": string;
  "日期": string;
  "時間": string;
  "負責人": string;
  "狀態": string;
}

interface FoodData {
  "品名": string;
  "數量": string;
  "單位": string;
  "過期日": string;
}

function daysUntilExpiry(expiry: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function HomePage() {
  const { currentUser } = useUser();
  const { data: weather } = useCachedFetch<WeatherData | null>("/api/weather?date=today", null);
  const { data: rawDevices } = useCachedFetch<DeviceData[]>("/api/devices", []);
  const { data: rawTodos } = useCachedFetch<TodoData[]>("/api/todos", []);
  const { data: rawFood } = useCachedFetch<FoodData[]>("/api/food", []);

  // Guard against non-array responses (e.g. error objects)
  const devices = Array.isArray(rawDevices) ? rawDevices : [];
  const todos = Array.isArray(rawTodos) ? rawTodos : [];
  const food = Array.isArray(rawFood) ? rawFood : [];

  const sensor = devices.find(d => d.type === "感應器");
  const myTodos = todos.filter(t =>
    t["狀態"] === "待辦" && (
      !currentUser || t["負責人"] === currentUser.name ||
      t["負責人"] === currentUser.name.substring(0, 2)
    )
  ).sort((a, b) => {
    const dateA = `${a["日期"]} ${a["時間"] || "99:99"}`;
    const dateB = `${b["日期"]} ${b["時間"] || "99:99"}`;
    return dateA.localeCompare(dateB);
  }).slice(0, 5);

  const urgentFood = food.filter(f => {
    const days = daysUntilExpiry(f["過期日"]);
    return days >= 0 && days <= 3;
  });

  const controllableDevices = devices.filter(d => d.type !== "感應器");
  const deviceIcons: Record<string, string> = {
    "空調": "❄️", "IR": "🌀", "除濕機": "💨",
  };

  // Complete todo
  function completeTodo(item: string) {
    fetch(`/api/todos?item=${encodeURIComponent(item)}`, { method: "DELETE" });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Weather + Indoor */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>🌤️ 天氣</CardTitle>
          </CardHeader>
          {weather && !("error" in weather) ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold">
                  {weather.max_t !== null ? `${weather.max_t}°C` : "--"}
                </span>
                <span className="text-gray-400">{weather.wx}</span>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                📍 {weather.city}{weather.location} ・ {weather.min_t}~{weather.max_t}°C
                {weather.pop !== null && ` ・ 降雨 ${weather.pop}%`}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">載入中...</p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>🌡️ 室內環境</CardTitle>
          </CardHeader>
          {sensor ? (
            <>
              <div className="flex items-baseline gap-6">
                <div>
                  <span className="text-3xl font-bold">{sensor.temperature}°C</span>
                </div>
                <div>
                  <span className="text-3xl font-bold">{sensor.humidity}%</span>
                  <span className="ml-1 text-sm text-gray-400">濕度</span>
                </div>
              </div>
              <p className="mt-1 text-sm text-gray-500">{sensor.name}</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">載入中...</p>
          )}
        </Card>
      </div>

      {/* Devices Quick Control */}
      <Card>
        <CardHeader>
          <CardTitle>📱 裝置快捷</CardTitle>
          <Link href="/devices" className="text-sm text-blue-400 hover:text-blue-300">
            查看全部 →
          </Link>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {controllableDevices.map((device) => (
            <Link
              key={device.name}
              href={`/devices?target=${encodeURIComponent(device.name)}`}
              className="flex flex-col items-center gap-2 rounded-xl border border-gray-700 bg-gray-800/50 hover:bg-gray-800 p-4 transition-colors"
            >
              <span className="text-2xl">{deviceIcons[device.type] ?? "📱"}</span>
              <span className="text-sm font-medium">{device.name}</span>
            </Link>
          ))}
        </div>
      </Card>

      {/* Todos + Food Alerts */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>☑️ 待辦事項</CardTitle>
            <Link href="/todos" className="text-sm text-blue-400 hover:text-blue-300">
              查看全部 →
            </Link>
          </CardHeader>
          {myTodos.length > 0 ? (
            <ul className="space-y-2">
              {myTodos.map((todo, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <button
                    onClick={() => completeTodo(todo["事項"])}
                    className="flex-shrink-0 w-4 h-4 rounded border-2 border-gray-500 hover:border-green-400 hover:bg-green-400/20 transition-colors"
                    title="標記完成"
                  />
                  <span className="text-gray-200">
                    {todo["事項"]}
                    {todo["時間"] && <span className="ml-1 text-gray-500">{todo["時間"]}</span>}
                  </span>
                  <span className="ml-auto text-xs text-gray-500">{todo["日期"]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">沒有待辦事項</p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>⚠️ 即期食品</CardTitle>
            <Link href="/food" className="text-sm text-blue-400 hover:text-blue-300">
              查看全部 →
            </Link>
          </CardHeader>
          {urgentFood.length > 0 ? (
            <ul className="space-y-2">
              {urgentFood.map((f, i) => {
                const days = daysUntilExpiry(f["過期日"]);
                const label = days === 0 ? "今天到期" : days === 1 ? "明天到期" : `${days}天後到期`;
                return (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-200">{f["品名"]} {f["數量"]}{f["單位"]}</span>
                    <span className="text-xs text-red-400">{label}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">沒有即期食品</p>
          )}
        </Card>
      </div>
    </div>
  );
}
