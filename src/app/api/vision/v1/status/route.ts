import { configuredVisionPilotTransport } from "@/lib/vision-pilot";
import { requireVision, verifiedVisionActor, visionUnavailable, visionError, visionJSON } from "@/lib/vision-server";
import { configuredVisionHTTPTransport } from "@/lib/vision-http";
export async function GET(request: Request) {
  try {
    const capabilities = await requireVision(request, "status");
    let result;
    if (process.env.DASHBOARD_VISION_STATUS_PILOT === "1") {
      const transport = configuredVisionPilotTransport();
      if (!transport) return visionUnavailable();
      result = await transport.status(await verifiedVisionActor(request), capabilities, request.signal);
    } else {
      const transport = configuredVisionHTTPTransport();
      if (!transport) return visionUnavailable();
      result = await transport.status(capabilities, request.signal);
    }
    await requireVision(request, "status");
    return visionJSON(result);
  } catch (error) { return visionError(error); }
}
