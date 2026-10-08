import { getAuthUser, getAdminClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/supabase.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

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

    // Mode OpenAI
    if (mode === "openai" && OPENAI_API_KEY) {
      const systemPrompt = `Tu es un assistant expert en prospection B2B et recherche d'emploi.
Tu aides l'utilisateur à cadrer sa session de recherche via une discussion guidée.

RÈGLES :
- Pose UNE question à la fois pour faire avancer le cadrage
- Sois concis, direct, humain
- Ne fais pas de flatterie, pas de phrases creuses
- L'objectif : extraire les infos pour construire un blueprint complet

ÉTAPES DU CADRAGE (dans l'ordre) :
1. Régions ciblées
2. Mots-clés de recherche exacts
3. Types d'entreprises / cibles prioritaires
4. Ce qu'il faut ÉVITER dans les messages (no-go)
5. Ton / style souhaité
6. Petite demande finale (call to action)
7. Profil de l'utilisateur (ce qu'il propose, son expertise, sa crédibilité)

Quand tu as assez d'infos (tous les points couverts), réponds avec :
- reply: "Parfait. Je génère le blueprint complet."
- blueprint: (objet JSON complet - voir structure ci-dessous)
- progress: 100
- done: true

STRUCTURE BLUEPRINT ATTENDUE :
{
  "summary": "Session job_search cadrée via discussion IA",
  "parameters": {
    "search_regions": "France",
    "search_keywords": "prototypage électronique Lyon",
    "target_company_types": "PME industrielles, startups hardware",
    "excluded_keywords": "recrutement, stage, alternance",
    "email_tone": "direct, humain, concret, terrain",
    "user_profile_summary": "10 ans hardware embarqué, ESP32, prototypage rapide"
  },
  "builder_values": {
    "use_case": "job_search",
    "objective": "obtenir des échanges techniques courts",
    "profile": "10 ans hardware embarqué...",
    "targets": "PME industrielles, startups hardware",
    "proof": "projets ESP32, cartes électroniques livrées",
    "tone": "direct, humain, concret",
    "no_go": "phrases creuses, forcing, promesses",
    "call_to_action": "proposer 15 min d'échange technique"
  },
  "prompts": {},
  "questions": [],
  "warnings": []
}`;

      const openaiMessages = [
        { role: "system", content: systemPrompt },
        ...messages.map((m: any) => ({ role: m.role, content: m.content }))
      ];

      let data: any = null;
      let openaiError = "";
      // Retry x2 + timeout: les erreurs réseau intermittentes sont fréquentes depuis edge
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 25000);
          const resp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: openaiMessages,
              temperature: 0.7,
              max_tokens: 800,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (resp.ok) {
            data = await resp.json();
            break;
          }
          openaiError = `OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`;
          if (resp.status === 400 || resp.status === 401) break; // pas la peine de retry
        } catch (fetchErr) {
          openaiError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        }
      }

      if (!data) {
        console.error("OpenAI error:", openaiError);
        // Fallback to local - ne JAMAIS renvoyer 500
        const reply = generateLocalReply(messages[messages.length - 1]?.content || "", messages.length, use_case, parameters);
        const progress = Math.min(90, messages.length * 15);
        const done = progress >= 90;
        const blueprint = done ? buildBlueprintFromChat(messages, use_case, parameters) : null;
        return jsonResponse({ ok: true, reply, blueprint, progress, mode: "openai_fallback", done });
      }

      const content = data.choices?.[0]?.message?.content?.trim() || "";

      // Try to parse JSON blueprint if present
      let blueprint = null;
      let reply = content;
      let done = false;
      let progress = 50;

      try {
        // Check if response contains a JSON blueprint
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.parameters || parsed.builder_values) {
            blueprint = parsed;
            reply = "Parfait. Je génère le blueprint complet.";
            done = true;
            progress = 100;
          }
        }
      } catch {}

      // Heuristic: if AI says it's done or we have blueprint
      if (!blueprint && (content.toLowerCase().includes("blueprint") || content.toLowerCase().includes("cadrage complet") || messages.length >= 10)) {
        blueprint = buildBlueprintFromChat(messages, use_case, parameters);
        done = true;
        progress = 100;
        reply = content || "Parfait. Je génère le blueprint complet.";
      } else if (!blueprint) {
        progress = Math.min(90, messages.length * 12);
      }

      return jsonResponse({ ok: true, reply, blueprint, progress, mode: "openai", done });
    }

    // Fallback
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

  if (lower.includes("cible") || lower.includes("startup") || lower.includes("pme") || msgCount >= 6) {
    return "Compris. Qu'est-ce que tu ne veux surtout PAS dans tes messages ? (ex: 'phrases creuses', 'forcing commercial', 'promesses non tenues')";
  }

  if (lower.includes("pas") || lower.includes("évit") || lower.includes("ne veux") || msgCount >= 8) {
    return "C'est noté. Quelle doit être la petite demande finale de tes messages ? (ex: 'proposer 15 min d\\'échange', 'demander le bon contact', 'savoir s\\'il y a un besoin')";
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
  const words = text.split(/\s+/).filter(w => w.length > 3);
  return words.slice(0, 5).join(" ");
}

function extractTargets(text: string): string {
  if (text.toLowerCase().includes("startup")) return "Startups";
  if (text.toLowerCase().includes("pme")) return "PME";
  if (text.toLowerCase().includes("grand compte")) return "Grands comptes";
  return "Entreprises";
}