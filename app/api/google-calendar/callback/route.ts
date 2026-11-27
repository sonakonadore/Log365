import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { calendarRequest } from "../../../../lib/google/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  return calendarRequest(request, env, user?.userId ?? null);
}
