import { getAuthUser, getAdminClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);
    const user = await getAuthUser(authHeader);
    if (!user) return errorResponse("Invalid token", 401);

    const body = await req.json();
    const { description, use_case, parameters } = body;

    // Pour l'instant: blueprint basique basé sur la description
    // TODO: intégrer OpenAI pour vraie analyse
    const blueprint = {
      summary: `Session ${use_case} créée à partir de votre description`,
      parameters: {
        search_regions: parameters?.search_regions || "France",
        search_keywords: parameters?.search_keywords || description.split(" ").slice(0, 5).join(" "),
        target_company_types: parameters?.target_company_types || "Entreprises recherchant " + use_case.replace("_", " "),
        excluded_keywords: parameters?.excluded_keywords || "",
        email_tone: parameters?.email_tone || "professionnel, direct",
        user_profile_summary: parameters?.user_profile_summary || "",
      },
      builder_values: {
        use_case,
        objective: description,
        profile: parameters?.user_profile_summary || "",
        targets: parameters?.target_company_types || "",
        proof: "",
        tone: parameters?.email_tone || "",
        no_go: "",
        call_to_action: "Proposer un échange court",
      },
      prompts: {},
      questions: ["Précisez les régions cibles", "Quels mots-clés exacts pour la recherche ?"],
      warnings: [],
    };

    return jsonResponse({ ok: true, blueprint });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
