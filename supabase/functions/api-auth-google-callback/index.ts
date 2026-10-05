import { getAuthUser, getAdminClient, getCorsHeaders, jsonResponse, errorResponse } from "../_shared/supabase.ts";
import { createCipheriv, randomBytes } from "node:crypto";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI")!;
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;
const KEY = new TextEncoder().encode(ENCRYPTION_KEY).slice(0, 32);

function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = cipher.update(new TextEncoder().encode(text));
  cipher.final();
  const authTag = cipher.getAuthTag();
  const combined = new Uint8Array(iv.length + encrypted.length + authTag.length);
  combined.set(iv);
  combined.set(encrypted, iv.length);
  combined.set(authTag, iv.length + encrypted.length);
  return btoa(String.fromCharCode(...combined));
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(`<h1>Erreur OAuth: ${error}</h1><p><a href="/parametres.html">Retour</a></p>`, {
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      });
    }

    if (!code || !state) {
      return new Response(`<h1>Paramètres manquants</h1><p><a href="/parametres.html">Retour</a></p>`, {
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      });
    }

    const admin = getAdminClient();

    // Verify state
    const { data: stateData, error: stateError } = await admin
      .from("oauth_states")
      .select("*")
      .eq("state", state)
      .eq("provider", "google")
      .single();

    if (stateError || !stateData) {
      return new Response(`<h1>État invalide ou expiré</h1><p><a href="/parametres.html">Retour</a></p>`, {
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      });
    }

    const userId = stateData.user_id;

    // Exchange code for tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: GOOGLE_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok) {
      return new Response(`<h1>Erreur échange token: ${tokenData.error_description || "unknown"}</h1><p><a href="/parametres.html">Retour</a></p>`, {
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      });
    }

    // Get user info from Google
        const userInfoResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
    const userInfo = await userInfoResp.json();

    // Encrypt tokens
    const accessEncrypted = encrypt(tokenData.access_token);
    const refreshEncrypted = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : "";

    // Store tokens
    await admin.from("oauth_tokens").upsert({
      user_id: userId,
      provider: "google",
      access_token_encrypted: accessEncrypted,
      refresh_token_encrypted: refreshEncrypted,
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      email: userInfo.email,
      updated_at: new Date().toISOString(),
    });

    // Delete used state
    await admin.from("oauth_states").delete().eq("state", state);

    // Redirect back to parametres.html with success
    return new Response(`<html><body><script>window.close(); window.opener?.postMessage({type: 'oauth-success', provider: 'google'}, '*');</script><p>Connexion Google réussie. Vous pouvez fermer cette fenêtre.</p></body></html>`, {
      headers: { ...corsHeaders, "Content-Type": "text/html" },
    });
  } catch (e) {
    return new Response(`<h1>Erreur: ${e instanceof Error ? e.message : "Unknown error"}</h1><p><a href="/parametres.html">Retour</a></p>`, {
      headers: { ...corsHeaders, "Content-Type": "text/html" },
    });
  }
});