import { getUserClient, getAdminClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);

    const userClient = getUserClient(authHeader);
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return errorResponse("Invalid token", 401);

    const admin = getAdminClient();

    // Fetch all data for this user
    const [companies, emails, sessions, settings] = await Promise.all([
      admin.from("companies").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      admin.from("emails").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      admin.from("sessions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      admin.from("settings").select("*").eq("user_id", user.id).single(),
    ]);

    return jsonResponse({
      companies: companies.data || [],
      emails: emails.data || [],
      sessions: sessions.data || [],
      settings: settings.data || null,
      user: { id: user.id, email: user.email },
    });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});