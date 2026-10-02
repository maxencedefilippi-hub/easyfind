import { getAuthUser, getAdminClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/supabase.ts";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

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

function decrypt(encryptedB64: string): string {
  const buf = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const iv = buf.slice(0, 12);
  const ciphertext = buf.slice(12);
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(ciphertext.slice(-16));
  const decrypted = decipher.update(ciphertext.slice(0, -16));
  return new TextDecoder().decode(decrypted);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);

    const user = await getAuthUser(authHeader);
    if (!user) return errorResponse("Invalid token", 401);

    const admin = getAdminClient();

    if (req.method === "POST") {
      const { action, code, provider, refresh_token } = await req.json();
      
      if (action === "store" && code && provider) {
        // Exchange code for tokens
        const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
            client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
            code,
            grant_type: "authorization_code",
            redirect_uri: Deno.env.get("GOOGLE_REDIRECT_URI")!,
          }),
        });
        
        const tokenData = await tokenResp.json();
        if (!tokenResp.ok) return errorResponse(tokenData.error_description || "Token exchange failed", 500);
        
        // Encrypt and store
        const accessEncrypted = encrypt(tokenData.access_token);
        const refreshEncrypted = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : "";
        
        await admin.from("oauth_tokens").upsert({
          user_id: user.id,
          provider,
          access_token_encrypted: accessEncrypted,
          refresh_token_encrypted: refreshEncrypted,
          expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        });
        
        return jsonResponse({ success: true });
      }
      
      if (action === "refresh" && provider) {
        // Get stored refresh token
        const { data: tokens, error } = await admin
          .from("oauth_tokens")
          .select("*")
          .eq("user_id", user.id)
          .eq("provider", provider)
          .single();
        
        if (error || !tokens?.refresh_token_encrypted) {
          return errorResponse("No refresh token available", 400);
        }
        
        const refreshToken = decrypt(tokens.refresh_token_encrypted);
        
        // Refresh access token
        const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
            client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });
        
        const tokenData = await tokenResp.json();
        if (!tokenResp.ok) return errorResponse(tokenData.error_description || "Token refresh failed", 500);
        
        // Encrypt and update
        const accessEncrypted = encrypt(tokenData.access_token);
        
        await admin.from("oauth_tokens")
          .update({ 
            access_token_encrypted: accessEncrypted,
            expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id).eq("provider", provider);
        
        return jsonResponse({ success: true, access_token: tokenData.access_token });
      }
      
      if (action === "get" && provider) {
        const { data: tokens, error } = await admin
          .from("oauth_tokens")
          .select("*")
          .eq("user_id", user.id)
          .eq("provider", provider)
          .single();
        
        if (error || !tokens) return errorResponse("No tokens found", 404);
        
        return jsonResponse({
          access_token: decrypt(tokens.access_token_encrypted),
          expires_at: tokens.expires_at,
        });
      }
      
      return errorResponse("Invalid action", 400);
    }

    return errorResponse("Method not allowed", 405);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});