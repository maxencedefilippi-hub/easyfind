import { getAuthUser, getAdminClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);

    const user = await getAuthUser(authHeader);
    if (!user) return errorResponse("Invalid token", 401);

    const admin = getAdminClient();

    // Session demandée via ?session_id= sinon la session active de l'utilisateur
    const url = new URL(req.url);
    const requestedSessionId = url.searchParams.get("session_id");
    const { data: dbSessions } = await admin
      .from("sessions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50);

    const sessions = dbSessions || [];
    const activeSession =
      (requestedSessionId && sessions.find((s: any) => s.id === requestedSessionId)) ||
      sessions.find((s: any) => s.status === "active") ||
      sessions[0] ||
      null;
    const activeId = activeSession ? activeSession.id : "";

    const [companiesRes, emailsRes, settingsRes, jobLogRes, oauthTokensRes, serpApiSettingsRes] = await Promise.all([
      activeId
        ? admin.from("companies").select("*").eq("user_id", user.id).eq("session_id", activeId).order("created_at", { ascending: false })
        : admin.from("companies").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      activeId
        ? admin.from("emails").select("*").eq("user_id", user.id).eq("session_id", activeId).order("created_at", { ascending: false })
        : admin.from("emails").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      admin.from("settings").select("*").eq("user_id", user.id).maybeSingle(),
      admin.from("job_log").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
      admin.from("oauth_tokens").select("*").eq("user_id", user.id).eq("provider", "google").maybeSingle(),
      admin.from("settings").select("serpapi_key").eq("user_id", user.id).maybeSingle(),
    ]);

    const companies = companiesRes.data || [];
    const emails = emailsRes.data || [];
    const settings = settingsRes.data || {};
    const lastJob = (jobLogRes.data && jobLogRes.data[0]) || null;
    const oauthTokens = oauthTokensRes.data;
    const serpApiSettings = serpApiSettingsRes.data;

    const totalCompanies = companies.length;
    const sentCompanies = new Set(
      emails.filter((e: any) => ["sent", "sent_ok", "replied"].includes(e.status)).map((e: any) => e.company_id)
    ).size;
    const replied = emails.filter((e: any) => e.status === "replied").length;

    const googleConnected = Boolean(oauthTokens?.refresh_token_encrypted);
    const googleEmail = oauthTokens?.email || null;
    const serpApiConnected = Boolean(serpApiSettings?.serpapi_key);

    const state = {
      user: { id: user.id, email: user.email },
      session: {
        active_id: activeId,
        sessions: sessions.map((s: any) => ({
          id: s.id,
          name: s.name,
          kind: s.kind || s.session_kind || "job_search",
          autopilot_enabled: s.autopilot_enabled !== false,
          can_delete: sessions.length > 1,
        })),
      },
      companies,
      emails,
      stats: {
        total_companies: totalCompanies,
        valid_sent_companies: sentCompanies,
        replies: replied,
      },
      rate_limit: {
        limit: Number(settings.daily_contact_limit || 10),
        used_today: 0,
      },
      autopilot: {
        enabled: activeSession ? activeSession.autopilot_enabled !== false : false,
      },
      job: lastJob
        ? {
            status: lastJob.status || "neutral",
            label: lastJob.label || "",
            started_at: lastJob.created_at,
            log: lastJob.log || "",
          }
        : { status: "neutral", label: "", started_at: null, log: "" },
      connections: {
        google: {
          connected: googleConnected,
          email: googleEmail,
          status: googleConnected ? "connecté" : "non connecté",
          credentials_present: googleConnected,
        },
        serpapi: {
          connected: serpApiConnected,
          status: serpApiConnected ? "connecté" : "non connecté",
          api_key_present: serpApiConnected,
        },
      },
      copy: settings.ui_copy || null,
    };

    return jsonResponse(state);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
