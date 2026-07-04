// Lightweight diagnostic endpoint. Reports whether the active provider has an
// API key configured — WITHOUT ever exposing the key itself. The UI uses this
// to show a "Connected" vs "Demo mode" badge so you instantly know if the key
// is loaded.

import { DEFAULT_MODEL_ID, getModel } from "@/lib/models";
import { isProviderConfigured } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  const model = getModel(DEFAULT_MODEL_ID)!;
  const configured = isProviderConfigured(model.provider);
  return Response.json({
    // true = real AI engine active, false = running in offline demo mode
    connected: configured,
    mode: configured ? "live" : "demo",
  });
}
