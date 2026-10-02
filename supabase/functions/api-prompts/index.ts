import { getAuthUser, getAdminClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);
    const user = await getAuthUser(authHeader);
    if (!user) return errorResponse("Invalid token", 401);

    const admin = getAdminClient();
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    let prompts = {};
    if (sessionId) {
      // Récupérer les prompts de la session spécifique
      const { data: session } = await admin
        .from("sessions")
        .select("config")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();
      prompts = session?.config?.prompts || {};
    } else {
      // Fallback: settings user-level
      const { data: settings } = await admin
        .from("settings")
        .select("prompts")
        .eq("user_id", user.id)
        .maybeSingle();
      prompts = settings?.prompts || {};
    }
    return jsonResponse({ prompts });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
