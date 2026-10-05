import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Retourne l'utilisateur authentifié à partir du header Authorization.
// Vérifie le JWT via l'API auth directement (fiable, pas de client intermédiaire).
export async function getAuthUser(authHeader: string): Promise<{ id: string; email: string } | null> {
  const token = (authHeader || "").replace("Bearer ", "").trim();
  if (!token) return null;
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const user = await resp.json();
  if (!user?.id) return null;
  return { id: user.id as string, email: (user.email || "") as string };
}

// Client admin (service role) pour les requêtes RLS-free.
export function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
}

export function corsHeaders() {
  return getCorsHeaders();
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}
