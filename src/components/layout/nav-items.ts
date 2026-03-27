export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "首頁", icon: "🏠" },
  { href: "/devices", label: "裝置", icon: "🔌" },
  { href: "/todos", label: "待辦", icon: "☑️" },
  { href: "/food", label: "食品庫存", icon: "🍎" },
  { href: "/schedules", label: "排程", icon: "⏰" },
];
