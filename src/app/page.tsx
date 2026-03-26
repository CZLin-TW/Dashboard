"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";

// --- Mock data (will be replaced by API calls) ---
const mockWeather = {
  location: "台北市",
  temperature: 28,
  description: "多雲",
  rainProbability: 20,
};

const mockIndoor = {
  temperature: 27.5,
  humidity: 65,
  sensor: "SwitchBot Hub",
};

const mockDevices = [
  { name: "冷氣", status: "運轉中", detail: "26°C 冷氣模式", icon: "❄️", active: true },
  { name: "除濕機", status: "運轉中", detail: "自動 60%", icon: "💨", active: true },
  { name: "電扇", status: "關閉", detail: "", icon: "🌀", active: false },
];

const mockTodos = [
  { item: "繳電費", date: "今天", person: "小明", done: false },
  { item: "看牙醫 14:00", date: "今天", person: "小華", done: false },
  { item: "倒垃圾", date: "今天", person: "小明", done: true },
];

const mockFoodAlerts = [
  { name: "牛奶", expiry: "明天到期", urgent: true },
  { name: "雞蛋 x6", expiry: "後天到期", urgent: true },
  { name: "高麗菜", expiry: "3天後", urgent: false },
];

// --- Page ---
export default function HomePage() {
  const { currentUser } = useUser();

  const myTodos = currentUser
    ? mockTodos.filter((t) => t.person === currentUser.name)
    : mockTodos;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Weather + Indoor */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>🌤️ 天氣</CardTitle>
          </CardHeader>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold">{mockWeather.temperature}°C</span>
            <span className="text-gray-400">{mockWeather.description}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            📍 {mockWeather.location} ・ 降雨機率 {mockWeather.rainProbability}%
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>🌡️ 室內環境</CardTitle>
          </CardHeader>
          <div className="flex items-baseline gap-6">
            <div>
              <span className="text-3xl font-bold">{mockIndoor.temperature}°C</span>
            </div>
            <div>
              <span className="text-3xl font-bold">{mockIndoor.humidity}%</span>
              <span className="ml-1 text-sm text-gray-400">濕度</span>
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-500">{mockIndoor.sensor}</p>
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
          {mockDevices.map((device) => (
            <button
              key={device.name}
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                device.active
                  ? "border-blue-500/30 bg-blue-500/10"
                  : "border-gray-700 bg-gray-800/50 hover:bg-gray-800"
              }`}
            >
              <span className="text-2xl">{device.icon}</span>
              <span className="text-sm font-medium">{device.name}</span>
              <span className={`text-xs ${device.active ? "text-blue-400" : "text-gray-500"}`}>
                {device.status}
              </span>
              {device.detail && (
                <span className="text-xs text-gray-400">{device.detail}</span>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Todos + Food Alerts */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>☑️ 今日待辦</CardTitle>
            <Link href="/todos" className="text-sm text-blue-400 hover:text-blue-300">
              查看全部 →
            </Link>
          </CardHeader>
          <ul className="space-y-2">
            {myTodos.map((todo) => (
              <li key={todo.item} className="flex items-center gap-3 text-sm">
                <span className={`flex-shrink-0 ${todo.done ? "text-green-400" : "text-gray-500"}`}>
                  {todo.done ? "☑" : "☐"}
                </span>
                <span className={todo.done ? "text-gray-500 line-through" : "text-gray-200"}>
                  {todo.item}
                </span>
                <span className="ml-auto text-xs text-gray-500">{todo.person}</span>
              </li>
            ))}
          </ul>
          {myTodos.length === 0 && (
            <p className="text-sm text-gray-500">今天沒有待辦事項 🎉</p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>⚠️ 即期食品</CardTitle>
            <Link href="/food" className="text-sm text-blue-400 hover:text-blue-300">
              查看全部 →
            </Link>
          </CardHeader>
          <ul className="space-y-2">
            {mockFoodAlerts.map((food) => (
              <li key={food.name} className="flex items-center justify-between text-sm">
                <span className="text-gray-200">{food.name}</span>
                <span className={`text-xs ${food.urgent ? "text-red-400" : "text-yellow-400"}`}>
                  {food.expiry}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* F@H Mini Status */}
      <Card>
        <CardHeader>
          <CardTitle>🧬 Folding@Home</CardTitle>
          <Link href="/fah" className="text-sm text-blue-400 hover:text-blue-300">
            查看詳情 →
          </Link>
        </CardHeader>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="rounded-lg bg-gray-800/50 p-4">
            <p className="text-xs text-gray-400">A7600X_N4070Ti</p>
            <p className="mt-1 text-sm font-medium text-green-400">運算中</p>
          </div>
          <div className="rounded-lg bg-gray-800/50 p-4">
            <p className="text-xs text-gray-400">Xeon-1230V2</p>
            <p className="mt-1 text-sm font-medium text-gray-500">No work</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
