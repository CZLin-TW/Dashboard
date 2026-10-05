import { requireVision, visionUnavailable, visionError, visionJSON } from "@/lib/vision-server";
import { configuredVisionHTTPTransport } from "@/lib/vision-http";
export async function GET(request: Request) {
  try {
    const capabilities = await requireVision(request, "status");
    const transport = configuredVisionHTTPTransport();
    return transport ? visionJSON(await transport.status(capabilities, request.signal)) : visionUnavailable();
  } catch (error) { return visionError(error); }
}
