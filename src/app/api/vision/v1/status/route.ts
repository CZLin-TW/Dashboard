import { configuredVisionPilotTransport } from "@/lib/vision-pilot";
import { requireVision, visionUnavailable, visionError, visionJSON } from "@/lib/vision-server";
import { configuredVisionHTTPTransport } from "@/lib/vision-http";
export async function GET(request: Request) {
  try {
    const capabilities = await requireVision(request, "status");
    const transport = process.env.DASHBOARD_VISION_STATUS_PILOT === "1" ? configuredVisionPilotTransport() : configuredVisionHTTPTransport();
    if (!transport) return visionUnavailable();
    const result = await transport.status(capabilities, request.signal);
    await requireVision(request, "status");
    return visionJSON(result);
  } catch (error) { return visionError(error); }
}
