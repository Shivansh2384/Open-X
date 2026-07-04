// Returns the client-safe list of models. Backend provider/model identifiers
// are never included here, so they never reach the browser bundle.

import { getPublicModels } from "@/lib/models";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ models: getPublicModels() });
}
