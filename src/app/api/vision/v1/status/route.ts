import { requireVision, visionUnavailable, visionError } from "@/lib/vision-server";
export async function GET(request: Request) {
  try { await requireVision(request, "status"); return visionUnavailable(); }
  catch (error) { return visionError(error); }
}
