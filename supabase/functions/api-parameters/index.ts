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

    if (req.method === "GET") {
      const { data, error } = await admin.from("settings").select("*").eq("user_id", user.id).single();
      if (error && error.code !== "PGRST116") return errorResponse(error.message, 500);
      return jsonResponse(data || {});
    }

    if (req.method === "POST" || req.method === "PUT") {
      const body = await req.json();
      const { data, error } = await admin.from("settings").upsert({ ...body, user_id: user.id, updated_at: new Date().toISOString() }).select().single();
      if (error) return errorResponse(error.message, 500);
      return jsonResponse(data);
    }

    return errorResponse("Method not allowed", 405);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});