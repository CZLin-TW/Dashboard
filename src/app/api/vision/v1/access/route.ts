import { requireVision, visionJSON, visionError } from "@/lib/vision-server";
export async function GET(request: Request) {
  try { return visionJSON({ capabilities: await requireVision(request) }); }
  catch (error) { return visionError(error); }
}
