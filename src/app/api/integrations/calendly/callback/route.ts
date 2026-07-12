import { oauthCallback } from "@/server/oauth/route-handler";

export async function GET(request: Request) {
  return oauthCallback(request, "calendly");
}
