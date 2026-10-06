import { nativeMediaAvailable } from "@/lib/vision-media-server";
import { requireVision, visionJSON, visionError } from "@/lib/vision-server";
export async function GET(request: Request) {
  try { return visionJSON({ capabilities: await requireVision(request), ...(nativeMediaAvailable() ? { native_preview_available: true } : {}) }); }
  catch (error) { return visionError(error); }
}
