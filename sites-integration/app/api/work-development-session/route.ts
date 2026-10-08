import { env } from "cloudflare:workers";
import { isOwnerRequest } from "../../lib/ledger";
import { issueDevelopmentHandoff } from "../../../shared-backend/work-session-handoff.mjs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => issueDevelopmentHandoff(request, {
  env, authorize: async () => {
    if (!env.OWNER_EMAIL?.trim() || !isOwnerRequest(request)) return null;
    return {id: request.headers.get("oai-authenticated-user-id")};
  }
});
