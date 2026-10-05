import { requireVision, requireVisionMutation, readVisionBody, validateVisionConfig, visionUnavailable, visionError } from "@/lib/vision-server";
export async function GET(request: Request) {
  try { await requireVision(request, "status"); return visionUnavailable(); }
  catch (error) { return visionError(error); }
}
export async function PUT(request: Request) {
  try {
    await requireVision(request, "edit");
    requireVisionMutation(request);
    validateVisionConfig(await readVisionBody(request));
    return visionUnavailable();
  } catch (error) { return visionError(error); }
}
