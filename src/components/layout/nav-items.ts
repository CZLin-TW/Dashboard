import { Home, Plug, CheckSquare, Apple, Clock, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "首頁", icon: Home },
  { href: "/devices", label: "裝置", icon: Plug },
  { href: "/todos", label: "待辦", icon: CheckSquare },
  { href: "/food", label: "庫存", icon: Apple },
  { href: "/schedules", label: "排程", icon: Clock },
];
