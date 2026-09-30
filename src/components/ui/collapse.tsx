"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * 高度 + 透明度的平滑展開／收合。曲線與時間沿用首頁 DeviceQuickControl 的面板，
 * 讓全站收合手感一致；使用者開啟「減少動態效果」時瞬間切換。
 *
 * keepMounted：收合時仍保留子元件（例如要保存草稿的表單），用 inert 阻止焦點與互動。
 * 預設收合即卸載，適合昂貴的圖表。
 */
export function Collapse({
  open,
  children,
  id,
  keepMounted = false,
  className,
}: {
  open: boolean;
  children: ReactNode;
  id?: string;
  keepMounted?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const transition = {
    height: { duration: reduceMotion ? 0 : 0.28, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
    opacity: { duration: reduceMotion ? 0 : 0.18, ease: "easeOut" as const },
  };
  const hidden = { opacity: 0, height: 0 };
  const shown = { opacity: 1, height: "auto" };

  if (keepMounted) {
    return (
      <motion.div
        id={id}
        initial={false}
        animate={open ? shown : hidden}
        transition={transition}
        aria-hidden={!open}
        inert={!open}
        className={`overflow-hidden ${className ?? ""}`}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapse"
          id={id}
          initial={hidden}
          animate={shown}
          exit={hidden}
          transition={transition}
          className={`overflow-hidden ${className ?? ""}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
