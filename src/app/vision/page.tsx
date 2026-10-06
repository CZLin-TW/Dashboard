import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { authorizeVisionPage } from "@/lib/vision-page-access";
import { VisionHealthPanel } from "@/components/vision/vision-health-panel";

export default async function VisionPage() {
  try {
    const request = new Request("http://dashboard.internal/vision", { headers: new Headers(await headers()) });
    await authorizeVisionPage(request);
  } catch { notFound(); }
  return <VisionHealthPanel />;
}
