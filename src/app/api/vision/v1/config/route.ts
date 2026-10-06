import { requireVision, requireVisionMutation, readVisionBody, validateVisionConfig, visionUnavailable, visionError, visionJSON } from "@/lib/vision-server";
import { configuredVisionHTTPTransport } from "@/lib/vision-http";
export async function GET(request: Request) {
  try {
    await requireVision(request, "status");
    if (process.env.DASHBOARD_VISION_STATUS_PILOT === "1") return visionJSON({code:"vision_pilot_status_only"}, 403);
    const transport = configuredVisionHTTPTransport();
    return transport ? visionJSON(await transport.config(request.signal)) : visionUnavailable();
  } catch (error) { return visionError(error); }
}
export async function PUT(request: Request) {
  try {
    await requireVision(request, "edit");
    requireVisionMutation(request);
    const config = await readVisionBody(request); validateVisionConfig(config);
    const transport = configuredVisionHTTPTransport();
    return transport ? visionJSON(await transport.save(config, request.signal)) : visionUnavailable();
  } catch (error) { return visionError(error); }
}
