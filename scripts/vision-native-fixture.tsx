/** Real component fixture: standard same-origin authenticated BFF fetch, no API mocks. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NativeVisionPreview } from "../src/components/vision/native-vision-preview";
function Fixture() {
  const [visible, setVisible] = useState(true);
  return <main style={{ maxWidth: 900, margin: "auto", padding: 16, background: "#101b25", color: "#e3eaf0", minHeight: "100vh" }}>
    <h1>Dashboard 原生合成預覽測試</h1>
    <p>真實 React 元件與同源 BFF；合成影像，非真相機。</p>
    <button style={{ minHeight: 44, padding: 12 }} onClick={() => setVisible(value => !value)}>{visible ? "移除預覽元件" : "掛回預覽元件"}</button>
    {visible && <NativeVisionPreview />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
