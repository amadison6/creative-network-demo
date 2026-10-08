import { env } from "cloudflare:workers";
import { workMachineProxy } from "../../../../shared-backend/work-machine-proxy.mjs";
export const dynamic = "force-dynamic";
const handle = (request: Request) => workMachineProxy(request, env);
export const GET = handle;
export const POST = handle;
