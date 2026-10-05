import { requireVision, requireVisionMutation, visionUnavailable, visionError } from "@/lib/vision-server";
export async function POST(request: Request) {
  try { await requireVision(request, "preview"); requireVisionMutation(request); return visionUnavailable(); }
  catch (error) { return visionError(error); }
}
