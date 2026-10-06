import { mediaRoute } from "@/lib/vision-media-server";
export async function POST(request: Request) { return mediaRoute(request, "heartbeat"); }
