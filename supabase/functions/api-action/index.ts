import { getAuthUser, getAdminClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/supabase.ts";

// Dispatch des actions du dashboard. Les actions longues (recherche SerpApi, génération emails)
// sont déclenchées côté serveur GitHub Actions - ici on gère les actions légères CRUD.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);
    const user = await getAuthUser(authHeader);
    if (!user) return errorResponse("Invalid token", 401);

    const body = await req.json();
    const action = body.action || "";
    const admin = getAdminClient();
    const uid = user.id;

    switch (action) {
      case "set_status": {
        const { company_id, status } = body;
        if (!company_id) return errorResponse("company_id requis");
        const { error } = await admin.from("companies").update({ status }).eq("id", company_id).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "update_company": {
        const { company_id, ...fields } = body;
        if (!company_id) return errorResponse("company_id requis");
        const allowed: Record<string, unknown> = {};
        for (const k of ["detected_email", "website_url", "contact_page_url", "notes", "next_followup_at", "status", "latest_reply_status"]) {
          if (k in fields) allowed[k] = fields[k];
        }
        const { error } = await admin.from("companies").update(allowed).eq("id", company_id).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "update_email": {
        const { email_id, email_to, subject, body: emailBody, personalization_notes, status, reply_status } = body;
        if (!email_id) return errorResponse("email_id requis");
        const { error } = await admin.from("emails").update({
          ...(email_to !== undefined ? { email_to } : {}),
          ...(subject !== undefined ? { subject } : {}),
          ...(emailBody !== undefined ? { body: emailBody } : {}),
          ...(personalization_notes !== undefined ? { personalization_notes } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(reply_status !== undefined ? { reply_status } : {}),
        }).eq("id", email_id).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "mark_email_sent": {
        const { email_id } = body;
        if (!email_id) return errorResponse("email_id requis");
        const { data: email } = await admin.from("emails").select("company_id").eq("id", email_id).eq("user_id", uid).maybeSingle();
        const { error } = await admin.from("emails").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", email_id).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        if (email?.company_id) {
          await admin.from("companies").update({ status: "contacted" }).eq("id", email.company_id).eq("user_id", uid);
        }
        return jsonResponse({ ok: true });
      }
      case "mark_replied": {
        const { company_id, reply_status, note } = body;
        if (!company_id) return errorResponse("company_id requis");
        const { error } = await admin.from("companies").update({
          status: "replied", latest_reply_status: reply_status || "to_analyze",
          ...(note ? { notes: note } : {}),
        }).eq("id", company_id).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "mark_bad_email": {
        const { company_id, email_id, note } = body;
        if (company_id) {
          const { error } = await admin.from("companies").update({
            detected_email: null, status: "new",
            ...(note ? { notes: note } : {}),
          }).eq("id", company_id).eq("user_id", uid);
          if (error) return errorResponse(error.message, 500);
        }
        if (email_id) {
          await admin.from("emails").update({ status: "error" }).eq("id", email_id).eq("user_id", uid);
        }
        return jsonResponse({ ok: true });
      }
      case "schedule_followup": {
        const { company_id, days, note } = body;
        if (!company_id) return errorResponse("company_id requis");
        const d = new Date();
        d.setDate(d.getDate() + (Number(days) || 40));
        const { error } = await admin.from("companies").update({
          next_followup_at: d.toISOString().split("T")[0],
          ...(note ? { notes: note } : {}),
        }).eq("id", company_id).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "save_parameters": {
        const { parameters } = body;
        if (!parameters || typeof parameters !== "object") return errorResponse("parameters requis");
        const { error } = await admin.from("settings").update(parameters).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "save_prompts": {
        const { prompts } = body;
        if (!prompts || typeof prompts !== "object") return errorResponse("prompts requis");
        const { error } = await admin.from("settings").update({ prompts }).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "save_session_prompts": {
        const { session_id, prompts } = body;
        if (!session_id) return errorResponse("session_id requis");
        if (!prompts || typeof prompts !== "object") return errorResponse("prompts requis");
        // Stocker les prompts dans sessions.config.prompts (JSONB)
        const { data: session } = await admin
          .from("sessions")
          .select("config")
          .eq("id", session_id)
          .eq("user_id", uid)
          .maybeSingle();
        const config = session?.config || {};
        config.prompts = prompts;
        const { error } = await admin
          .from("sessions")
          .update({ config })
          .eq("id", session_id)
          .eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "save_serpapi_key": {
        const { api_key } = body;
        const key = String(api_key || "").trim();
        // Test rapide de la clé contre SerpApi
        if (key) {
          const test = await fetch(`https://serpapi.com/search?engine=google&q=test&api_key=${encodeURIComponent(key)}`);
          if (!test.ok && test.status === 401) return errorResponse("Clé SerpApi invalide (401 de SerpApi).", 400);
        }
        const { error } = await admin.from("serpapi_keys").upsert({
          user_id: uid, api_key_encrypted: key, updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "create_session": {
        const { name, kind } = body;
        if (!name) return errorResponse("name requis");
        const { data, error } = await admin.from("sessions").insert({
          user_id: uid, name, kind: kind || "job_search", is_active: false,
        }).select().single();
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true, session: data });
      }
      case "switch_session": {
        const { session_id } = body;
        if (!session_id) return errorResponse("session_id requis");
        await admin.from("sessions").update({ is_active: false }).eq("user_id", uid);
        const { error } = await admin.from("sessions").update({ is_active: true }).eq("id", session_id).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "toggle_autopilot": {
        const { session_id, enabled } = body;
        if (!session_id) return errorResponse("session_id requis");
        const { error } = await admin.from("sessions").update({ autopilot_enabled: enabled !== false }).eq("id", session_id).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "delete_session": {
        const { session_id } = body;
        if (!session_id) return errorResponse("session_id requis");
        const { error } = await admin.from("sessions").delete().eq("id", session_id).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "set_session_autopilot": {
        const { session_id, enabled } = body;
        if (!session_id) return errorResponse("session_id requis");
        const { error } = await admin.from("sessions").update({ autopilot_enabled: enabled !== false }).eq("id", session_id).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "mark_form_sent": {
        const { company_id } = body;
        if (!company_id) return errorResponse("company_id requis");
        const { error } = await admin.from("companies").update({ status: "contacted" }).eq("id", company_id).eq("user_id", uid);
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true });
      }
      case "regenerate_email":
      case "regenerate_form_message":
      case "generate_form_message": {
        // La génération de contenu exige l'IA - gérée par GitHub Actions.
        // Ici: on prépare la demande en job_log pour le prochain run.
        const { company_id } = body;
        if (!company_id) return errorResponse("company_id requis");
        const { error } = await admin.from("job_log").insert({
          user_id: uid, session_id: null, company_id, email_id: null,
          action, status: "pending",
          details: { message: "Demande de génération enregistrée. Elle sera traitée par le prochain run planifié." },
        });
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ ok: true, queued: true, message: "Demande enregistrée. Le message sera généré par le prochain run automatique." });
      }
      case "send_email": {
        const { email_id } = body;
        if (!email_id) return errorResponse("email_id requis");
        const { data: email } = await admin.from("emails").select("*").eq("id", email_id).eq("user_id", uid).maybeSingle();
        if (!email) return errorResponse("Email introuvable", 404);
        const { data: tokenRow } = await admin.from("oauth_tokens").select("*").eq("user_id", uid).maybeSingle();
        if (!tokenRow?.access_token) {
          return errorResponse("Gmail non connecté. Impossible d'envoyer directement. Copiez le message et envoyez-le manuellement.", 400);
        }
        const sendResp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${tokenRow.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            raw: btoa(unescape(encodeURIComponent(
              `To: ${email.email_to}\r\nSubject: ${email.subject || "(sans objet)"}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${email.body || ""}`
            ))).replace(/\+/g, "-").replace(/\//g, "_"),
          }),
        });
        if (!sendResp.ok) {
          const errText = await sendResp.text();
          return errorResponse(`Gmail a refusé l'envoi: ${errText.slice(0, 200)}`, 502);
        }
        await admin.from("emails").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", email_id).eq("user_id", uid);
        if (email.company_id) {
          await admin.from("companies").update({ status: "contacted" }).eq("id", email.company_id).eq("user_id", uid);
        }
        return jsonResponse({ ok: true });
      }
      case "save_google_credentials":
      case "clear_google_credentials": {
        // Les credentials OAuth Google (client_id/secret personnels) sont stockés dans settings.
        const { credentials_json } = body;
        if (action === "clear_google_credentials") {
          const { error } = await admin.from("settings").update({ google_credentials_json: null }).eq("user_id", uid);
          if (error) return errorResponse(error.message, 500);
        } else {
          if (!credentials_json) return errorResponse("credentials_json requis");
          const { error } = await admin.from("settings").update({ google_credentials_json: credentials_json }).eq("user_id", uid);
          if (error) return errorResponse(error.message, 500);
        }
        return jsonResponse({ ok: true });
      }
      default:
        return errorResponse(`Action '${action}' non supportée par l'API en ligne. Utilisez la recherche planifiée (GitHub Actions) pour les actions lourdes.`, 400);
    }
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
