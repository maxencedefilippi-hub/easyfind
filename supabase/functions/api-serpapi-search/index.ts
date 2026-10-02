import { getAuthUser, getAdminClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);

    const user = await getAuthUser(authHeader);
    if (!user) return errorResponse("Invalid token", 401);

    const admin = getAdminClient();

    if (req.method === "POST") {
      const { query, location, num_results } = await req.json();
      if (!query) return errorResponse("Missing query", 400);

      // Get user's SerpApi key
      const { data: keyData, error: keyError } = await admin
        .from("serpapi_keys")
        .select("api_key_encrypted")
        .eq("user_id", user.id)
        .single();

      if (keyError || !keyData) return errorResponse("No SerpApi key configured", 400);

      // Decrypt key (same encryption as Gmail)
      const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;
      const KEY = new TextEncoder().encode(ENCRYPTION_KEY).slice(0, 32);
      
      const { createDecipheriv } = await import("node:crypto");
      const buf = Uint8Array.from(atob(keyData.api_key_encrypted), c => c.charCodeAt(0));
      const iv = buf.slice(0, 12);
      const ciphertext = buf.slice(12);
      const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
      decipher.setAuthTag(ciphertext.slice(-16));
      const decrypted = decipher.update(ciphertext.slice(0, -16));
      const apiKey = new TextDecoder().decode(decrypted);

      // Call SerpApi
      const params = new URLSearchParams({
        api_key: apiKey,
        engine: "google",
        q: query,
        num: String(num_results || 10),
      });
      if (location) params.set("location", location);

      const serpResp = await fetch(`https://serpapi.com/search?${params.toString()}`);
      const serpData = await serpResp.json();
      
      if (!serpResp.ok) return errorResponse(serpData.error || "SerpApi request failed", 500);

      // Save search to history
      await admin.from("serpapi_searches").insert({
        user_id: user.id,
        query,
        location: location || null,
        results: serpData,
      });

      return jsonResponse(serpData);
    }

    return errorResponse("Method not allowed", 405);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});