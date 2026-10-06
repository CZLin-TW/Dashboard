/** Server-only page entry. The HB owner pin + current membership is authoritative. */
import { requireVision } from "./vision-server";
import { VisionHTTPError } from "./vision-http";
export async function authorizeVisionPage(request: Request): Promise<void> {
  if (process.env.DASHBOARD_VISION_STATUS_PILOT !== "1") throw new VisionHTTPError(503, "vision_pilot_unavailable");
  await requireVision(request, "status");
}
