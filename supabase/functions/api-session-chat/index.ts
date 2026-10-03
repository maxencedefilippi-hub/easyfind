import { getAuthUser, getAdminClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);
    const user = await getAuthUser(authHeader);
    if (!user) return errorResponse("Invalid token", 401);

    const body = await req.json();
    const { messages, use_case, mode, parameters, prompts } = body;

    // Local mode: réponses simples sans OpenAI
    if (mode === "local") {
      const lastUserMsg = [...messages].reverse().find(m => m.role === "user")?.content || "";
      
      // Logique basique pour faire avancer le cadrage
      const reply = generateLocalReply(lastUserMsg, messages.length, use_case, parameters);
      const progress = Math.min(90, messages.length * 15);
      const done = progress >= 90;
      
      const blueprint = done ? buildBlueprintFromChat(messages, use_case, parameters) : null;
      
      return jsonResponse({ ok: true, reply, blueprint, progress, mode: "local", done });
    }

    // Mode OpenAI: placeholder pour l'instant
    return jsonResponse({ 
      ok: true, 
      reply: "Mode IA non configuré. Utilise le mode local.", 
      progress: 100, 
      mode: "local_openai_ready", 
      done: true 
    });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});

function generateLocalReply(lastMsg: string, msgCount: number, useCase: string, params: any): string {
  const lower = lastMsg.toLowerCase();
  
  if (msgCount <= 2) {
    return `D'accord. Tu veux faire du ${useCase.replace("_", " ")}. 
Quelles régions vises-tu ? (ex: "Lyon, Paris, Île-de-France" ou "France entière")`;
  }
  
  if (lower.includes("région") || lower.includes("zone") || lower.includes("france") || lower.includes("lyon") || lower.includes("paris")) {
    return "Noté pour les régions. Quels mots-clés l'app doit-elle chercher ? (ex: 'développeur web', 'prototypage électronique', 'ingénieur hardware')";
  }
  
  if (lower.includes("mot-clé") || lower.includes("chercher") || lower.includes("recherche") || msgCount >= 4) {
    return "OK. Qui cibles-tu en priorité ? (ex: 'startups tech', 'PME industrielles', 'grands comptes', 'agences')";
  }
  
  if (lower.includes("cible") || lower.includes("cible") || lower.includes("startup") || lower.includes("pme") || msgCount >= 6) {
    return "Compris. Qu'est-ce que tu ne veux surtout PAS dans tes messages ? (ex: 'phrases creuses', 'forcing commercial', 'promesses non tenues')";
  }
  
  if (lower.includes("pas") || lower.includes("évit") || lower.includes("ne veux") || msgCount >= 8) {
    return "C'est noté. Quelle doit être la petite demande finale de tes messages ? (ex: 'proposer 15 min d\'échange', 'demander le bon contact', 'savoir s\'il y a un besoin')";
  }
  
  return "Parfait. Je vais générer le cadrage complet. Clique sur 'Appliquer au pilotage + messages'.";
}

function buildBlueprintFromChat(messages: any[], useCase: string, params: any) {
  const userMessages = messages.filter(m => m.role === "user").map(m => m.content).join(" ");
  
  return {
    summary: `Session ${useCase} cadrée via discussion`,
    parameters: {
      search_regions: params?.search_regions || extractRegion(userMessages) || "France",
      search_keywords: params?.search_keywords || extractKeywords(userMessages) || useCase.replace("_", " "),
      target_company_types: params?.target_company_types || extractTargets(userMessages) || "Entreprises",
      excluded_keywords: params?.excluded_keywords || "",
      email_tone: params?.email_tone || "professionnel, direct, humain",
      user_profile_summary: params?.user_profile_summary || "",
    },
    builder_values: {
      use_case,
      objective: userMessages,
      profile: params?.user_profile_summary || "",
      targets: params?.target_company_types || "",
      proof: "",
      tone: params?.email_tone || "",
      no_go: "",
      call_to_action: "Proposer un échange court",
    },
    prompts: {},
    questions: [],
    warnings: [],
  };
}

function extractRegion(text: string): string {
  const regions = ["france", "lyon", "paris", "marseille", "bordeaux", "lille", "nantes", "strasbourg", "toulouse", "nice", "île-de-france", "auvergne", "bretagne", "normandie", "paca", "occitanie", "hauts-de-france", "grand est", "pays de la loire", "centre-val de loire", "bourgogne", "nouvelle-aquitaine"];
  for (const r of regions) {
    if (text.toLowerCase().includes(r)) return r;
  }
  return "";
}

function extractKeywords(text: string): string {
  // Très basique
  const words = text.split(/\s+/).filter(w => w.length > 3);
  return words.slice(0, 5).join(" ");
}

function extractTargets(text: string): string {
  if (text.toLowerCase().includes("startup")) return "Startups";
  if (text.toLowerCase().includes("pme")) return "PME";
  if (text.toLowerCase().includes("grand compte")) return "Grands comptes";
  return "Entreprises";
}
