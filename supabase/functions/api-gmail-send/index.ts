import { getAuthUser, getAdminClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/supabase.ts";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;
const KEY = new TextEncoder().encode(ENCRYPTION_KEY).slice(0, 32);

function decrypt(encryptedB64: string): string {
  const buf = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const iv = buf.slice(0, 12);
  const ciphertext = buf.slice(12);
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(ciphertext.slice(-16));
  const decrypted = decipher.update(ciphertext.slice(0, -16));
  return new TextDecoder().decode(decrypted);
}

async function getAccessToken(admin: ReturnType<typeof getAdminClient>, userId: string): Promise<string> {
  const { data: tokens, error } = await admin
    .from("oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .single();
  
  if (error || !tokens) throw new Error("No OAuth tokens found");
  
  const refreshToken = decrypt(tokens.refresh_token_encrypted);
  
  // Refresh access token
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  
  const tokenData = await resp.json();
  if (!resp.ok) throw new Error(tokenData.error_description || "Token refresh failed");
  
  // Update stored access token
  const cipher = createCipheriv("aes-256-gcm", KEY, randomBytes(12));
  const encrypted = cipher.update(tokenData.access_token);
  cipher.final();
  const authTag = cipher.getAuthTag();
  const combined = new Uint8Array(cipher.nonce.length + encrypted.length + authTag.length);
  combined.set(cipher.nonce);
  combined.set(encrypted, cipher.nonce.length);
  combined.set(authTag, cipher.nonce.length + encrypted.length);
  const encryptedB64 = btoa(String.fromCharCode(...combined));
  
  await admin.from("oauth_tokens")
    .update({ access_token_encrypted: encryptedB64, updated_at: new Date().toISOString() })
    .eq("user_id", userId).eq("provider", "google");
  
  return tokenData.access_token;
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
      const { to, subject, html, text } = await req.json();
      if (!to || !subject || (!html && !text)) {
        return errorResponse("Missing required fields", 400);
      }

      const accessToken = await getAccessToken(admin, user.id);

      const gmailResp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: btoa([
            `To: ${to}`,
            `Subject: ${subject}`,
            `Content-Type: text/html; charset=utf-8`,
            "",
            html || text,
          ].join("\r\n")),
        }),
      });

      const result = await gmailResp.json();
      if (!gmailResp.ok) return errorResponse(result.error?.message || "Gmail send failed", 500);
      
      return jsonResponse({ success: true, messageId: result.id });
    }

    return errorResponse("Method not allowed", 405);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});