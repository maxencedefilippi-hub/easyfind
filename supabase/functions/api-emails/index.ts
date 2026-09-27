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
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (req.method === "GET") {
      if (id) {
        const { data, error } = await admin.from("emails").select("*").eq("id", id).eq("user_id", user.id).single();
        if (error) return errorResponse(error.message, 404);
        return jsonResponse(data);
      }
      const { data, error } = await admin.from("emails").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) return errorResponse(error.message, 500);
      return jsonResponse(data || []);
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { data, error } = await admin.from("emails").insert({ ...body, user_id: user.id }).select().single();
      if (error) return errorResponse(error.message, 500);
      return jsonResponse(data, 201);
    }

    if (req.method === "PUT" && id) {
      const body = await req.json();
      const { data, error } = await admin.from("emails").update(body).eq("id", id).eq("user_id", user.id).select().single();
      if (error) return errorResponse(error.message, 500);
      return jsonResponse(data);
    }

    if (req.method === "DELETE" && id) {
      const { error } = await admin.from("emails").delete().eq("id", id).eq("user_id", user.id);
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true });
    }

    return errorResponse("Method not allowed", 405);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});