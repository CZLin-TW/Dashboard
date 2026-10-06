import { mediaRoute } from "@/lib/vision-media-server";
export async function GET(request: Request) { return mediaRoute(request, "state"); }
