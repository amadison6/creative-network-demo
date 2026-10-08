import { env } from "cloudflare:workers";
import { isOwnerRequest } from "../../../lib/ledger";
import { workBrowserProxy } from "../../../../shared-backend/work-browser-proxy.mjs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  return workBrowserProxy(request, {
    env, sourceApp: "network-hq",
    authorize: async () => {
      // Existing Sites headers are trusted only behind Sites dispatch.
      if (!env.OWNER_EMAIL?.trim() || !isOwnerRequest(request)) return null;
      return {id: request.headers.get("oai-authenticated-user-id")};
    }
  });
}
export const GET = handle;
export const POST = handle;
