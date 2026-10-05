import { getAuthUser, getAdminClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/supabase.ts";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI")!;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);

    const user = await getAuthUser(authHeader);
    if (!user) return errorResponse("Invalid token", 401);

    // Generate state for CSRF protection
    const state = crypto.randomUUID();
    
    // Store state in session/user metadata or a temp table
    const admin = getAdminClient();
    await admin.from("oauth_states").upsert({
      user_id: user.id,
      state,
      provider: "google",
      created_at: new Date().toISOString(),
    });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    return jsonResponse({ auth_url: authUrl.toString() });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});