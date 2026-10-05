// ===== EasyFind Edge Functions shim (injected for production) =====
// Intercepte fetch("/api/*") -> Edge Functions Supabase avec JWT utilisateur.
// La session est relue depuis localStorage (clé sb-...-auth-token).
(function() {
  const SUPABASE_URL = "https://nkhcdkvepcjyxpwiattc.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raGNka3ZlcGNqeXhwd2lhdHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwOTc1OTYsImV4cCI6MjEwNTY3MzU5Nn0.uKPoW5qg5x7U777nGdjVfCIPyu-D1gG61Z_9iCcXqgg";
  const nativeFetch = window.fetch.bind(window);

  function getAccessToken() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
          const raw = localStorage.getItem(key);
          const parsed = JSON.parse(raw);
          // Structure: { access_token, refresh_token, ... } ou { currentSession: {...} }
          const sess = parsed.currentSession || parsed;
          if (sess && sess.access_token) return sess.access_token;
        }
      }
    } catch (e) {}
    return null;
  }

  function edgeUrl(path) {
    // "/api/state" -> SUPABASE_URL/functions/v1/api-state
    const name = path.replace(/^\/api\//, "api-").replace(/\//g, "-");
    return SUPABASE_URL + "/functions/v1/" + name;
  }

  async function getSessionToken() {
    // 0. Attendre que le client supabase expose sa première session (max 500ms)
    try {
      if (window.__supaReady) {
        await Promise.race([
          window.__supaReady,
          new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
      }
    } catch (e) {}
    // 1. Priorité: client supabase exposé par la page (window.__supa) + auto-refresh si token expiré
    try {
      if (window.__supa) {
        let { data } = await window.__supa.auth.getSession();
        if (data && data.session && data.session.access_token) {
          const exp = data.session.expires_at ? data.session.expires_at * 1000 : 0;
          if (exp && exp < Date.now() + 30000) {
            console.log('[shim] token expiré, refresh...');
            const { data: refreshData, error } = await window.__supa.auth.refreshSession();
            if (!error && refreshData?.session?.access_token) data = refreshData;
          }
          if (data?.session?.access_token) return data.session.access_token;
        }
      }
    } catch (e) { console.warn('[shim] __supa error:', e); }
    return getAccessToken();
  }

  window.fetch = async function(input, init) {
    let url = (typeof input === "string") ? input : (input && input.url) || "";
    if (url.startsWith("/api/")) {
      const token = await getSessionToken();
      const headers = new Headers((init && init.headers) || {});
      headers.set("Authorization", "Bearer " + token);
      headers.set("apikey", SUPABASE_ANON_KEY);
      const edge = edgeUrl(url);
      const resp = await nativeFetch(edge, { ...init, headers });
      if (!resp.ok) console.error('[shim] ' + url + ' -> ' + resp.status, await resp.clone().text().catch(() => ''));
      return resp;
    }
    return nativeFetch(input, init);
  };
})();
// ===== fin shim =====

const companyStatuses = [
  "new",
  "enriched",
  "qualified",
  "rejected",
  "no_email",
  "formulaire_en_ligne",
  "draft_created",
  "sent",
  "followup_due",
  "followup_created",
  "replied",
  "blacklisted",
];

const emailStatuses = ["generated", "form_generated", "draft_created", "sent", "skipped", "failed"];

const replyStatuses = [
  { value: "", label: "Non renseigné" },
  { value: "no_reply", label: "Pas encore de réponse" },
  { value: "positive", label: "Réponse positive" },
  { value: "interview", label: "Entretien / échange prévu" },
  { value: "no_hiring_now", label: "No hiring now / pas de recrutement maintenant" },
  { value: "away_until", label: "Absent / en congé jusqu'à une date" },
  { value: "recontact_after_date", label: "Recontacter à partir d'une date" },
  { value: "keep_in_touch", label: "À recontacter plus tard" },
  { value: "forwarded", label: "Transmis en interne" },
  { value: "wrong_contact", label: "Mauvais contact" },
  { value: "auto_reply", label: "Réponse automatique" },
  { value: "negative", label: "Réponse négative" },
  { value: "refused", label: "Refus clair" },
  { value: "not_hiring", label: "Ne recrute pas" },
  { value: "no_budget", label: "Pas de budget / pas de besoin" },
  { value: "blacklist", label: "Ne plus contacter" },
];

const baseCopy = {
  brandSubtitle: "CRM de prospection locale",
  topTitle: "Prospection pilotée proprement",
  navTargets: "Contacts",
  navMessages: "Messages",
  sideNote: "Messages internes, envoi manuel",
  workflowTitle: "Flux de travail",
  workflowEyebrow: "Recherche",
  workflowLimitLabel: "Objectif sécurisé",
  launchButton: "Lancer une recherche",
  launchHint: "Cherche, enrichit, score et prépare les messages. Aucun envoi automatique.",
  launchNoQuotaHint: "Quota quotidien atteint. Reprends demain.",
  missingMailButton: "Créer les mails manquants",
  missingMailHint: "Crée les messages des contacts prêts avec adresse email, sans envoi automatique.",
  missingMailNoneHint: "Aucun mail manquant à créer.",
  settingsTitle: "Paramètres de recherche",
  promptsTitle: "Instructions des messages",
  promptBuilderTitle: "Assistant de session",
  targetPanelTitle: "Contacts",
  targetEyebrow: "Suivi",
  targetDetailEyebrow: "Fiche contact",
  targetSingular: "contact",
  targetPlural: "contacts",
  targetMetric: "Contacts",
  targetSearchPlaceholder: "Rechercher un contact",
  targetTableHeader: "Contact",
  noTargets: "Aucun contact dans ce filtre.",
  messagesEyebrow: "Messages",
  messagesTitle: "Messages et réponses",
  allMessagesFilter: "Tous les messages",
  messageNoSelection: "Aucun message sélectionné",
  noMessages: "Aucun message dans ce filtre.",
  contactFieldLabel: "Contact / formulaire",
  manualEmailHelp: "Si la fiche est en no_email, ajouter une adresse ici la remettra en qualified.",
  followupLabel: "Recontact / relance",
  scoreHeader: "Score",
  actionHeader: "Action",
  createdAtHeader: "Créé le",
  recipientHeader: "Destinataire",
  replyHeader: "Réponse",
  statusHeader: "Statut",
  contactHeader: "Contact",
  qualifiedHint: "à convertir",
  qualificationMetric: "À qualifier",
  qualificationHint: "email ou formulaire",
  formReadyMetric: "Formulaires prêts",
  formReadyHint: "à envoyer",
  sentMetric: "Contactés",
  sentHint: "valides",
  repliesMetric: "Réponses",
  repliesHint: "à analyser",
  searchTermsLabel: "Ce que l'app cherche",
  targetTypesLabel: "Qui cibler",
  toneLabel: "Ton message",
  profileLabel: "Profil / offre",
  objectivePlaceholder: "Ex: obtenir un échange court, présenter une offre, demander le bon contact...",
  profileBuilderLabel: "Qui je suis / ce que je propose",
  profileBuilderPlaceholder: "Décris ton profil, ton offre ou ton activité. Ne parle pas d'une entreprise précise ici.",
  targetsBuilderLabel: "Qui je veux contacter",
  targetsBuilderPlaceholder: "Types de contacts, secteurs, régions, interlocuteurs. L'entreprise précise sera ajoutée automatiquement.",
  actions: {
    repairNames: "Nettoyer noms",
    search: "Rechercher",
    completeSearch: "Recherche complète",
    generateMessages: "Générer messages",
    followups: "Générer relances",
    formMessages: "Messages formulaires",
    markSent: "Marquer envoyés",
    markFormsSent: "Marquer formulaires envoyés",
    resetFollowups: "Annuler relances supprimées",
  },
  promptLabels: {
    email_generation_fr: "Message initial",
    followup_generation_fr: "Message de relance",
    company_scoring_fr: "Scoring cible",
  },
  statusLabels: {
    new: "Nouveau",
    enriched: "Enrichi",
    qualified: "À contacter",
    rejected: "Rejeté",
    no_email: "Sans email",
    formulaire_en_ligne: "Formulaire en ligne",
    draft_created: "Brouillon créé",
    sent: "Contacté",
    followup_due: "Relance due",
    followup_created: "Relance créée",
    replied: "Réponse reçue",
    blacklisted: "Blacklisté",
  },
  emailStatusLabels: {
    generated: "Message prêt",
    form_generated: "Formulaire prêt",
    draft_created: "Brouillon créé",
    sent: "Envoyé",
    skipped: "Ignoré",
    failed: "Échec",
  },
  replyStatusLabels: {
    no_hiring_now: "Pas de besoin maintenant",
    not_hiring: "Pas de besoin",
    no_budget: "Pas de budget",
    interview: "Échange prévu",
  },
};

const sessionCopyByKind = {
  job_search: {
    brandSubtitle: "CRM candidature locale",
    topTitle: "Candidatures ciblées, sans chaos",
    navTargets: "Entreprises",
    navMessages: "Emails",
    sideNote: "Messages de candidature, envoi manuel",
    workflowTitle: "Flux candidature",
    launchHint: "Cherche des entreprises, enrichit les fiches, score et prépare les candidatures. Aucun envoi automatique.",
    missingMailButton: "Créer les mails manquants",
    missingMailHint: "Crée les candidatures des entreprises à candidater avec adresse email.",
    settingsTitle: "Paramètres de recherche job",
    promptsTitle: "Instructions des emails",
    targetPanelTitle: "Entreprises",
    targetDetailEyebrow: "Fiche entreprise",
    targetSingular: "entreprise",
    targetPlural: "entreprises",
    targetMetric: "Entreprises",
    targetSearchPlaceholder: "Rechercher une entreprise",
    targetTableHeader: "Entreprise",
    noTargets: "Aucune entreprise dans ce filtre.",
    messagesEyebrow: "Emails",
    messagesTitle: "Emails et réponses",
    allMessagesFilter: "Tous les emails",
    messageNoSelection: "Aucun message sélectionné",
    noMessages: "Aucun email dans ce filtre.",
    manualEmailHelp: "Si la fiche est en no_email, ajouter une adresse ici la remettra en qualified.",
    profileLabel: "Résumé profil",
    profileBuilderLabel: "Mon profil",
    objectivePlaceholder: "Ex: obtenir un échange court ou une opportunité terrain.",
    targetsBuilderPlaceholder: "Types d'entreprises, interlocuteurs, secteurs, régions.",
    qualifiedHint: "à candidater",
    qualificationHint: "email ou formulaire",
    formReadyMetric: "Formulaires prêts",
    formReadyHint: "à candidater",
    sentMetric: "Envoyées",
    sentHint: "valides",
    actions: {
      search: "Rechercher entreprises",
      completeSearch: "Recherche complète job",
      generateMessages: "Générer candidatures",
    },
    promptLabels: {
      email_generation_fr: "Email de candidature",
      followup_generation_fr: "Email de relance",
      company_scoring_fr: "Scoring entreprise",
    },
    statusLabels: {
      qualified: "À candidater",
      rejected: "Rejetée",
      sent: "Candidature envoyée",
    },
    replyStatusLabels: {
      no_hiring_now: "Pas de recrutement maintenant",
      not_hiring: "Ne recrute pas",
      interview: "Entretien / échange prévu",
    },
  },
  sales_prospecting: {
    brandSubtitle: "CRM démarchage commercial",
    topTitle: "Prospection commerciale suivie proprement",
    navTargets: "Prospects",
    navMessages: "Messages",
    sideNote: "Messages commerciaux, envoi manuel",
    workflowTitle: "Flux commercial",
    launchHint: "Cherche des prospects, enrichit les fiches, score et prépare les messages commerciaux. Aucun envoi automatique.",
    settingsTitle: "Paramètres de prospection commerciale",
    promptsTitle: "Instructions commerciales",
    targetPanelTitle: "Prospects",
    targetDetailEyebrow: "Fiche prospect",
    targetSingular: "prospect",
    targetPlural: "prospects",
    targetMetric: "Prospects",
    targetSearchPlaceholder: "Rechercher un prospect",
    targetTableHeader: "Prospect",
    noTargets: "Aucun prospect dans ce filtre.",
    messagesTitle: "Messages commerciaux et réponses",
    allMessagesFilter: "Tous les messages",
    contactFieldLabel: "Contact / formulaire",
    profileLabel: "Offre / activité",
    profileBuilderLabel: "Mon offre / activité",
    objectivePlaceholder: "Ex: obtenir un appel découverte ou présenter une offre.",
    targetsBuilderLabel: "Prospects ciblés",
    targetsBuilderPlaceholder: "Secteurs, types de clients, décideurs, régions.",
    targetTypesLabel: "Qui prospecter",
    qualifiedHint: "à prospecter",
    qualificationHint: "contact ou formulaire",
    sentMetric: "Contactés",
    actions: {
      search: "Rechercher prospects",
      completeSearch: "Recherche commerciale complète",
      generateMessages: "Générer messages commerciaux",
      formMessages: "Messages formulaires contact",
    },
    statusLabels: {
      qualified: "À prospecter",
      rejected: "Hors cible",
      no_email: "Sans contact",
      sent: "Prospect contacté",
    },
  },
  find_clients: {
    brandSubtitle: "CRM acquisition clients",
    topTitle: "Recherche clients pilotée proprement",
    navTargets: "Clients",
    sideNote: "Messages clients, envoi manuel",
    workflowTitle: "Flux acquisition",
    launchHint: "Cherche des clients potentiels, enrichit les fiches, score et prépare les prises de contact. Aucun envoi automatique.",
    settingsTitle: "Paramètres de recherche clients",
    promptsTitle: "Instructions acquisition clients",
    targetPanelTitle: "Clients potentiels",
    targetDetailEyebrow: "Fiche client potentiel",
    targetSingular: "client potentiel",
    targetPlural: "clients potentiels",
    targetMetric: "Clients potentiels",
    targetSearchPlaceholder: "Rechercher un client potentiel",
    targetTableHeader: "Client potentiel",
    noTargets: "Aucun client potentiel dans ce filtre.",
    messagesTitle: "Messages clients et réponses",
    profileLabel: "Offre / activité",
    profileBuilderLabel: "Mon offre / activité",
    objectivePlaceholder: "Ex: trouver des clients ou proposer une mission.",
    targetsBuilderLabel: "Clients ciblés",
    targetsBuilderPlaceholder: "Types de clients, secteurs, décideurs, régions.",
    targetTypesLabel: "Clients à viser",
    qualifiedHint: "à contacter",
    actions: {
      search: "Rechercher clients",
      completeSearch: "Recherche clients complète",
      generateMessages: "Générer prises de contact",
    },
    statusLabels: {
      qualified: "Client à contacter",
      rejected: "Hors cible",
      sent: "Client contacté",
    },
  },
  partnership: {
    brandSubtitle: "CRM partenariats",
    topTitle: "Partenariats suivis sans dispersion",
    navTargets: "Partenaires",
    sideNote: "Messages partenariat, envoi manuel",
    workflowTitle: "Flux partenariat",
    launchHint: "Cherche des partenaires, enrichit les fiches, score et prépare les messages partenariat. Aucun envoi automatique.",
    settingsTitle: "Paramètres de recherche partenaires",
    promptsTitle: "Instructions partenariat",
    targetPanelTitle: "Partenaires",
    targetDetailEyebrow: "Fiche partenaire",
    targetSingular: "partenaire",
    targetPlural: "partenaires",
    targetMetric: "Partenaires",
    targetSearchPlaceholder: "Rechercher un partenaire",
    targetTableHeader: "Partenaire",
    noTargets: "Aucun partenaire dans ce filtre.",
    messagesTitle: "Messages partenariat et réponses",
    profileLabel: "Proposition / activité",
    profileBuilderLabel: "Proposition / activité",
    objectivePlaceholder: "Ex: proposer une collaboration, trouver un relais, créer un partenariat...",
    targetsBuilderLabel: "Partenaires ciblés",
    targetsBuilderPlaceholder: "Types de partenaires, secteurs, interlocuteurs, régions.",
    targetTypesLabel: "Partenaires à viser",
    qualifiedHint: "à proposer",
    sentMetric: "Contactés",
    actions: {
      search: "Rechercher partenaires",
      completeSearch: "Recherche partenariats complète",
      generateMessages: "Générer messages partenariat",
    },
    statusLabels: {
      qualified: "Partenaire potentiel",
      rejected: "Hors cible",
      sent: "Partenaire contacté",
    },
  },
  supplier: {
    brandSubtitle: "CRM fournisseurs",
    topTitle: "Contacts fournisseurs suivis proprement",
    navTargets: "Fournisseurs",
    targetPanelTitle: "Fournisseurs",
    targetSingular: "fournisseur",
    targetPlural: "fournisseurs",
    targetMetric: "Fournisseurs",
    targetSearchPlaceholder: "Rechercher un fournisseur",
    targetTableHeader: "Fournisseur",
    noTargets: "Aucun fournisseur dans ce filtre.",
    messagesTitle: "Messages fournisseurs et réponses",
    qualifiedHint: "à contacter",
    actions: {
      search: "Rechercher fournisseurs",
      completeSearch: "Recherche fournisseurs complète",
      generateMessages: "Générer demandes de contact",
    },
  },
  custom: {},
};

const COMPANIES_PAGE_SIZE = 50;
const EMAILS_PAGE_SIZE = 50;

let state = null;
let parameters = null;
let promptState = null;
let selectedCompanyId = "";
let selectedEmailId = "";
let selectedPromptKey = "email_generation_fr";
let promptRenderedSessionKind = "";
let sessionAssistantBlueprint = null;
let sessionChatMessages = [];
let sessionChatWaiting = false;
let sessionChatProgress = 0;
let sessionChatMode = "local";
let sessionChatBlueprintDone = false;
let sessionChatRestoredSessionId = "";
let actionInProgress = false;
let lastUserInteractionAt = 0;
let companiesVisibleLimit = COMPANIES_PAGE_SIZE;
let emailsVisibleLimit = EMAILS_PAGE_SIZE;
let setupCollapsed = localStorage.getItem("dreamsHunterSetupCollapsed") === "1";
let setupCollapseTouched = localStorage.getItem("dreamsHunterSetupCollapsed") !== null;
let settingsCollapsed = localStorage.getItem("dreamsHunterSettingsCollapsed") === "1";
let promptsCollapsed = localStorage.getItem("dreamsHunterPromptsCollapsed") === "1";
let emailsCollapsed = localStorage.getItem("dreamsHunterEmailsCollapsed") === "1";

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function attr(value) {
  return escapeHtml(value).replaceAll("'", "&#039;");
}

function mergeCopy(base, override = {}) {
  const merged = { ...base, ...override };
  merged.actions = { ...base.actions, ...(override.actions || {}) };
  merged.promptLabels = { ...base.promptLabels, ...(override.promptLabels || {}) };
  merged.statusLabels = { ...base.statusLabels, ...(override.statusLabels || {}) };
  merged.emailStatusLabels = { ...base.emailStatusLabels, ...(override.emailStatusLabels || {}) };
  merged.replyStatusLabels = { ...base.replyStatusLabels, ...(override.replyStatusLabels || {}) };
  return merged;
}

function activeSession() {
  const session = state?.session || {};
  return (session.sessions || []).find((item) => item.id === session.active_id) || {};
}

function activeSessionId() {
  return state?.session?.active_id || activeSession().id || "default";
}

function activeSessionKind() {
  return activeSession().kind || "job_search";
}

function currentCopy() {
  return mergeCopy(baseCopy, sessionCopyByKind[activeSessionKind()] || sessionCopyByKind.custom);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function setPlaceholder(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.placeholder = value;
}

function setFieldLabel(selector, value) {
  const element = document.querySelector(selector);
  const label = element?.closest("label")?.querySelector("span");
  if (label) label.textContent = value;
}

function labeledOptions(values, labels, current) {
  return values
    .map((value) => `<option value="${attr(value)}" ${value === current ? "selected" : ""}>${escapeHtml(labels[value] || value)}</option>`)
    .join("");
}

function statusPill(status) {
  const safeClass = escapeHtml(status || "vide");
  const copy = currentCopy();
  const label = copy.statusLabels[status] || copy.emailStatusLabels[status] || status || "vide";
  return `<span class="pill ${safeClass}">${escapeHtml(label)}</span>`;
}

function shortDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function dateToIso(value) {
  return value ? `${value}T09:00:00+00:00` : "";
}

function options(values, current) {
  return values
    .map((option) => {
      const value = optionValue(option);
      return `<option value="${attr(value)}" ${value === current ? "selected" : ""}>${escapeHtml(optionLabel(option))}</option>`;
    })
    .join("");
}

function optionValue(option) {
  return typeof option === "string" ? option : option.value;
}

function optionLabel(option) {
  return typeof option === "string" ? option || "vide" : option.label;
}

function replyStatusLabel(value) {
  const copy = currentCopy();
  if (copy.replyStatusLabels[value]) return copy.replyStatusLabels[value];
  const match = replyStatuses.find((status) => status.value === value);
  return match ? match.label : value || "";
}

function companyStatusOptions(current) {
  return labeledOptions(companyStatuses, currentCopy().statusLabels, current);
}

function emailStatusOptions(current) {
  return labeledOptions(emailStatuses, currentCopy().emailStatusLabels, current);
}

function replyStatusOptions(current) {
  const copy = currentCopy();
  return options(
    replyStatuses.map((status) => ({
      value: status.value,
      label: copy.replyStatusLabels[status.value] || status.label,
    })),
    current,
  );
}

function promptLabel(key, fallback) {
  return currentCopy().promptLabels[key] || fallback || key;
}

function findCompany(id) {
  return state?.companies.find((company) => company.id === id);
}

function findEmail(id) {
  return state?.emails.find((email) => email.id === id);
}

function companySearchText(company) {
  return [
    company?.company_name,
    company?.domain,
    company?.website_url,
    company?.contact_page_url,
    company?.detected_email,
    company?.latest_email_to,
    company?.city,
    company?.region,
    company?.company_summary,
    company?.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function canSendCompanyEmail(company) {
  return Boolean(sendableCompanyEmailId(company));
}

function sendableCompanyEmailId(company) {
  const latestStatus = company?.latest_email_status || "";
  const latestRecipient = String(company?.latest_email_to || "");
  if (!["generated", "draft_created"].includes(latestStatus)) return "";
  if (!company.latest_email_id) return "";
  if (!latestRecipient || latestRecipient.startsWith("FORMULAIRE:")) return "";
  if (["rejected", "no_email", "formulaire_en_ligne", "sent", "blacklisted"].includes(company.status)) {
    return "";
  }
  return company.latest_email_id;
}

function hasPendingFormMessage(companyId) {
  return Boolean(
    state?.emails?.some((email) => email.company_id === companyId && email.status === "form_generated"),
  );
}

function companyHasOpenableMessage(company) {
  return Boolean(
    company?.latest_email_id &&
      ["generated", "form_generated", "draft_created"].includes(company.latest_email_status || ""),
  );
}

function isFormRecipient(value) {
  const recipient = String(value || "");
  return recipient.startsWith("FORMULAIRE:") || recipient.startsWith("http://") || recipient.startsWith("https://");
}

function canMarkBadCompanyEmail(company) {
  const recipient = company?.detected_email || company?.latest_email_to || "";
  return Boolean(recipient && !isFormRecipient(recipient));
}

function canMarkBadEmail(email) {
  return Boolean(
    email &&
      ["generated", "draft_created", "sent"].includes(email.status || "") &&
      email.email_to &&
      !isFormRecipient(email.email_to),
  );
}

function canRegenerateCompanyEmail(company) {
  const recipient = String(company?.detected_email || company?.latest_email_to || "");
  if (!recipient || isFormRecipient(recipient)) return false;
  if (["rejected", "no_email", "formulaire_en_ligne", "sent", "blacklisted"].includes(company.status || "")) {
    return false;
  }
  if ((company.latest_email_status || "") === "sent") return false;
  return ["qualified", "draft_created", "followup_due", "followup_created"].includes(company.status || "");
}

function canRegenerateEmailMessage(email) {
  if (!email) return false;
  if (isFormRecipient(email.email_to)) return email.status === "form_generated";
  return ["generated", "draft_created"].includes(email.status || "");
}

function isEditing(selector) {
  return Boolean(document.activeElement?.closest(selector));
}

function isUserInteracting() {
  return Boolean(
    Date.now() - lastUserInteractionAt < 12000 ||
    document.activeElement?.matches("input, select, textarea") ||
      document.activeElement?.closest("#companyDetail, #emailDetail, .filters, .row-action"),
  );
}

function noteUserInteraction() {
  lastUserInteractionAt = Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sessionChatStorageKey(sessionId = activeSessionId()) {
  return `easyFindSessionChat:${sessionId || "default"}`;
}

function saveSessionChatState() {
  console.log("[EasyFind] saveSessionChatState", { sessionId: activeSessionId(), messagesCount: sessionChatMessages.length });
  if (!state?.session) return;
  const payload = {
    messages: sessionChatMessages,
    blueprint: sessionAssistantBlueprint,
    progress: sessionChatProgress,
    mode: sessionChatMode,
    done: sessionChatBlueprintDone,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(sessionChatStorageKey(), JSON.stringify(payload));
}

function clearStoredSessionChat(sessionId = activeSessionId()) {
  localStorage.removeItem(sessionChatStorageKey(sessionId));
}

function restoreSessionChatForActiveSession({ force = false } = {}) {
  console.log("[EasyFind] restoreSessionChatForActiveSession called", { force, sessionChatRestoredSessionId });
  if (!state?.session) { console.log("[EasyFind] no state.session"); return; }
  const sessionId = activeSessionId();
  console.log("[EasyFind] activeSessionId:", sessionId);
  if (!force && sessionChatRestoredSessionId === sessionId) { console.log("[EasyFind] SKIP - same session"); return; }
  sessionChatRestoredSessionId = sessionId;
  sessionChatWaiting = false;
  const storageKey = sessionChatStorageKey(sessionId);
  console.log("[EasyFind] Reading localStorage key:", storageKey);
  const raw = localStorage.getItem(storageKey);
  console.log("[EasyFind] raw localStorage:", raw ? raw.substring(0, 200) + "..." : "NULL");
  if (!raw) {
    sessionChatMessages = [];
    sessionAssistantBlueprint = null;
    sessionChatProgress = 0;
    sessionChatMode = "local";
    sessionChatBlueprintDone = false;
    renderSessionChatMessages();
    renderSessionChatProgress(sessionChatProgress, sessionChatMode);
    renderSessionChatWaiting();
    $("applySessionBlueprintBtn").disabled = true;
    return;
  }
  try {
    const payload = JSON.parse(raw);
    sessionChatMessages = Array.isArray(payload.messages)
      ? payload.messages
          .filter((message) => message && ["user", "assistant"].includes(message.role))
          .map((message) => ({
            role: message.role,
            content: String(message.content || ""),
          }))
      : [];
    sessionAssistantBlueprint =
      payload.blueprint && typeof payload.blueprint === "object" ? payload.blueprint : null;
    sessionChatProgress = Number(payload.progress || 0);
    sessionChatMode = String(payload.mode || "local");
    sessionChatBlueprintDone = Boolean(payload.done);
  } catch {
    sessionChatMessages = [];
    sessionAssistantBlueprint = null;
    sessionChatProgress = 0;
    sessionChatMode = "local";
    sessionChatBlueprintDone = false;
  }
  renderSessionChatMessages();
  renderSessionChatProgress(sessionChatProgress, sessionChatMode);
  renderSessionChatWaiting();
  if (sessionAssistantBlueprint) {
    renderSessionAssistantBlueprint(sessionAssistantBlueprint);
  }
  $("applySessionBlueprintBtn").disabled = !(sessionAssistantBlueprint && sessionChatBlueprintDone);
}

async function fetchState({ force = false } = {}) {
  if (actionInProgress && !force) return;
  if (isUserInteracting() && !force) return;
  const response = await fetch("/api/state");
  state = await response.json();
  restoreSessionChatForActiveSession({ force });
  render();
}

async function waitForActionDone(timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(450);
    const response = await fetch("/api/state");
    state = await response.json();
    renderSystem();
    if (state.job?.status !== "running") return state.job?.status || "neutral";
  }
  alert("L'action prend plus de temps que prévu. Elle continue peut-être en arrière-plan; le journal va rester visible.");
  return state?.job?.status || "running";
}

async function fetchParameters() {
  const response = await fetch("/api/parameters");
  parameters = await response.json();
  renderSettings();
}

async function fetchPrompts() {
  const sessionId = activeSessionId();
  const url = sessionId ? `/api/prompts?session_id=${encodeURIComponent(sessionId)}` : "/api/prompts";
  const response = await fetch(url);
  promptState = await response.json();
  renderPrompts();
}

function render() {
  if (!state) return;
  renderSystem();
  renderMetrics();
  renderFilters();
  if (
    promptState?.prompts &&
    promptRenderedSessionKind !== activeSessionKind() &&
    !isEditing("#promptEditor")
  ) {
    renderPrompts();
  }
  renderCompanies();
  renderEmails();
  if (!isEditing("#companyDetail")) renderCompanyDetail();
  if (!isEditing("#emailDetail")) renderEmailDetail();
}

function renderSystem() {
  applySessionCopy();
  renderSessions();
  renderConnections();
  renderSetupAssistant();
  renderSettingsPanelCollapse();
  renderPromptsPanelCollapse();
  renderEmailsPanelCollapse();
  const autopilot = state.autopilot;
  const autopilotStatus = $("autopilotStatus");
  if (autopilotStatus) autopilotStatus.textContent = autopilot.installed
    ? autopilot.loaded
      ? "actif"
      : "installé"
    : "désactivé";
  const dailyLimit = effectiveDailyLimit();
  const draftLimitEl = $("draftLimit");
  if (draftLimitEl) draftLimitEl.textContent = `${state.rate_limit.used_today} / ${dailyLimit}`;
  const dailyTargetLabel = $("dailyTargetLabel");
  if (dailyTargetLabel) dailyTargetLabel.textContent = `${dailyLimit} / jour max`;
  const jobStatusEl = $("jobStatus");
  if (jobStatusEl) jobStatusEl.textContent = state.job.title || "aucune";
  const jobBadge = $("jobBadge");
  if (jobBadge) { jobBadge.textContent = state.job.status; jobBadge.className = `badge ${state.job.status}`; }
  const jobLog = $("jobLog");
  if (jobLog) jobLog.textContent = state.job.log || "Aucune action lancée.";
  renderBusyOverlay();

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.disabled = state.job.status === "running";
  });
  syncLaunchControls();
}

function renderBusyOverlay() {
  const overlay = $("busyOverlay");
  if (!overlay) return;
  const running = actionInProgress || state?.job?.status === "running";
  document.body.classList.toggle("action-running", running);
  overlay.hidden = !running;
  if (!running) return;
  const title = state?.job?.title || "Action en cours";
  const status = state?.job?.status === "running" ? "en cours" : "démarrage";
  $("busyTitle").textContent = title;
  $("busyDetail").textContent = `Action ${status}. Tu peux suivre le détail dans le journal.`;
}

function renderConnections() {
  const google = state.connections?.google || {};
  const connected = Boolean(google.connected);
  const googleCredentialsPresent = Boolean(google.credentials_present);
  const dot = $("googleConnectionDot");
  if (dot) {
    dot.className = `connection-dot ${connected ? "connected" : "disconnected"}`;
  }
  const googleConnectionStatus = $("googleConnectionStatus");
  if (googleConnectionStatus) googleConnectionStatus.textContent = connected ? "Google connecté" : "Google non connecté";
  const googleConnectionDetail = $("googleConnectionDetail");
  if (googleConnectionDetail) googleConnectionDetail.textContent = googleStatusDetail(google);
  const googleConnectLink = $("googleConnectLink");
  googleConnectLink.textContent = connected
    ? "Reconnecter Google"
    : googleCredentialsPresent
      ? "Connecter Google"
      : "Ajouter OAuth Google";
  googleConnectLink.href = googleCredentialsPresent ? "/auth/google/start" : "#setupAssistant";

  const serpapi = state.connections?.serpapi || {};
  const serpApiConnected = Boolean(serpapi.connected);
  const serpApiDot = $("serpApiConnectionDot");
  if (serpApiDot) {
    serpApiDot.className = `connection-dot ${serpApiConnected ? "connected" : "disconnected"}`;
  }
  $("serpApiConnectionStatus").textContent = serpApiConnected
    ? "SerpApi connecté"
    : "SerpApi non connecté";
  $("serpApiConnectionDetail").textContent = serpApiDetail(serpapi);
  const serpApiInput = $("serpApiKeyInput");
  if (serpApiInput && document.activeElement !== serpApiInput) {
    serpApiInput.placeholder = serpapi.api_key_present
      ? "Laisser vide pour vérifier la clé"
      : "Coller la clé SerpApi";
  }
}

function renderSetupAssistant() {
  const google = state.connections?.google || {};
  const serpapi = state.connections?.serpapi || {};
  const googleReady = Boolean(google.connected);
  const googleCredentialsPresent = Boolean(google.credentials_present);
  const serpApiReady = Boolean(serpapi.connected);
  const assistant = $("setupAssistant");
  const content = $("setupContent");
  const button = $("toggleSetupPanelBtn");
  if (!assistant || !content || !button) return;
  if (!setupCollapseTouched) {
    setupCollapsed = googleReady && serpApiReady;
  }
  assistant.classList.toggle("collapsed", setupCollapsed);
  content.hidden = setupCollapsed;
  button.setAttribute("aria-expanded", String(!setupCollapsed));
  const label = setupCollapsed ? "Déplier la configuration" : "Réduire la configuration";
  button.setAttribute("aria-label", label);
  button.title = label;

  setSetupStep("setupGoogleStep", googleReady);
  setSetupStep("setupSerpApiStep", serpApiReady);
  setSetupStep("setupReadyStep", googleReady && serpApiReady);
  $("setupGoogleStatus").textContent = googleReady
    ? "Connecté"
    : googleCredentialsPresent
      ? google.message || "Connexion nécessaire"
      : "Importe d'abord google_credentials.json.";
  const setupGoogleConnectLink = $("setupGoogleConnectLink");
  if (setupGoogleConnectLink) {
    setupGoogleConnectLink.textContent = googleReady ? "Reconnecter Google" : "Connecter Google";
    setupGoogleConnectLink.classList.toggle("disabled-link", !googleCredentialsPresent);
    setupGoogleConnectLink.href = googleCredentialsPresent ? "/auth/google/start" : "#";
    setupGoogleConnectLink.setAttribute(
      "aria-disabled",
      String(!googleCredentialsPresent),
    );
  }
  const googleCredentialsHint = $("googleCredentialsHint");
  if (googleCredentialsHint) {
    googleCredentialsHint.textContent = googleCredentialsPresent
      ? "Fichier OAuth présent. Tu peux connecter Google."
      : "OAuth Desktop Google requis pour Gmail.";
  }
  const googleOAuthDebug = $("googleOAuthDebug");
  if (googleOAuthDebug) {
    googleOAuthDebug.innerHTML = googleCredentialsPresent
      ? [
          google.project_id ? `Projet OAuth: ${escapeHtml(google.project_id)}` : "",
          google.client_id ? `Client ID: ${escapeHtml(google.client_id)}` : "",
          "Ce Client ID doit être celui du projet Google Cloud où l'adresse Gmail est ajoutée en test user.",
        ]
          .filter(Boolean)
          .join("<br />")
      : "";
  }
  const clearGoogleCredentialsBtn = $("clearGoogleCredentialsBtn");
  if (clearGoogleCredentialsBtn) {
    clearGoogleCredentialsBtn.hidden = !googleCredentialsPresent;
  }
  $("setupSerpApiStatus").textContent = serpApiReady
    ? serpApiDetail(serpapi)
    : "Ouvre SerpApi, copie la clé, colle-la ici.";
  const setupKeyInput = $("serpApiSetupKeyInput");
  if (setupKeyInput && document.activeElement !== setupKeyInput) {
    setupKeyInput.placeholder = serpapi.api_key_present
      ? "Laisser vide pour vérifier la clé"
      : "Coller la clé SerpApi ici";
  }
  $("setupReadyStatus").textContent =
    googleReady && serpApiReady
      ? "Tu peux lancer une première recherche."
      : "Connecte Google et SerpApi avant la première recherche.";
  $("setupGoActionsBtn").disabled = !(googleReady && serpApiReady);
}

function toggleSetupPanel() {
  setupCollapseTouched = true;
  setupCollapsed = !setupCollapsed;
  localStorage.setItem("dreamsHunterSetupCollapsed", setupCollapsed ? "1" : "0");
  renderSetupAssistant();
}

function setSetupStep(id, ready) {
  const element = $(id);
  if (element) element.classList.toggle("ready", ready);
}

function renderSettingsPanelCollapse() {
  const panel = $("settings");
  const content = $("settingsContent");
  const button = $("toggleSettingsPanelBtn");
  if (!panel || !content || !button) return;
  panel.classList.toggle("collapsed", settingsCollapsed);
  content.hidden = settingsCollapsed;
  button.setAttribute("aria-expanded", String(!settingsCollapsed));
  const label = settingsCollapsed ? "Déplier le pilotage" : "Réduire le pilotage";
  button.setAttribute("aria-label", label);
  button.title = label;
}

function toggleSettingsPanel() {
  settingsCollapsed = !settingsCollapsed;
  localStorage.setItem("dreamsHunterSettingsCollapsed", settingsCollapsed ? "1" : "0");
  renderSettingsPanelCollapse();
}

function renderPromptsPanelCollapse() {
  const panel = $("prompts");
  const content = $("promptsContent");
  const button = $("togglePromptsPanelBtn");
  if (!panel || !content || !button) return;
  panel.classList.toggle("collapsed", promptsCollapsed);
  content.hidden = promptsCollapsed;
  button.setAttribute("aria-expanded", String(!promptsCollapsed));
  const label = promptsCollapsed ? "Déplier la personnalisation" : "Réduire la personnalisation";
  button.setAttribute("aria-label", label);
  button.title = label;
}

function togglePromptsPanel() {
  promptsCollapsed = !promptsCollapsed;
  localStorage.setItem("dreamsHunterPromptsCollapsed", promptsCollapsed ? "1" : "0");
  renderPromptsPanelCollapse();
}

function renderEmailsPanelCollapse() {
  const panel = $("emails");
  const content = $("emailsContent");
  const button = $("toggleEmailsPanelBtn");
  if (!panel || !content || !button) return;
  panel.classList.toggle("collapsed", emailsCollapsed);
  content.hidden = emailsCollapsed;
  button.setAttribute("aria-expanded", String(!emailsCollapsed));
  const label = emailsCollapsed ? "Déplier les emails" : "Réduire les emails";
  button.setAttribute("aria-label", label);
  button.title = label;
}

function toggleEmailsPanel() {
  emailsCollapsed = !emailsCollapsed;
  localStorage.setItem("dreamsHunterEmailsCollapsed", emailsCollapsed ? "1" : "0");
  renderEmailsPanelCollapse();
}

function applySessionCopy() {
  const copy = currentCopy();
  document.title = "EasyFind";
  setText(".brand h1", "EasyFind");
  setText(".brand-mark", "EF");
  setText(".brand p", copy.brandSubtitle);
  setText(".topbar h2", "EasyFind");
  setText('a[href="#companies"]', copy.navTargets);
  setText('a[href="#emails"]', copy.navMessages);
  const sideNote = document.querySelector(".side-note");
  if (sideNote) sideNote.innerHTML = `<span class="dot"></span>${escapeHtml(copy.sideNote)}`;
  setText("#actions .actions-panel .panel-heading .eyebrow", copy.workflowEyebrow);
  setText("#actions .actions-panel .panel-heading h3", copy.workflowTitle);
  setText("#actions .daily-target span", copy.workflowLimitLabel);
  setText('[data-action="complete_search"]', copy.launchButton);
  setText('[data-action="generate_emails"]', copy.missingMailButton);
  setText("#launchQuotaHint", copy.launchHint);
  setText("#missingEmailsHint", copy.missingMailHint);
  setText("#settings .panel-heading h3", copy.settingsTitle);
  setText("#prompts > .panel-heading h3", copy.promptsTitle);
  setText(".prompt-builder .compact-heading h4", copy.promptBuilderTitle);
  setText("#companies .panel-heading h3", copy.targetPanelTitle);
  setText("#emails .panel-heading .eyebrow", copy.messagesEyebrow);
  setText("#emails .panel-heading h3", copy.messagesTitle);
  setText('[data-action="repair_names"]', copy.actions.repairNames);
  setText('[data-action="search"]', copy.actions.search);
  setText('[data-action="complete_search"]', copy.actions.completeSearch);
  setText('[data-action="followups"]', copy.actions.followups);
  setText('[data-action="generate_form_messages"]', copy.actions.formMessages);
  setText('[data-action="mark_sent"]', copy.actions.markSent);
  setText('[data-action="mark_form_sent"]', copy.actions.markFormsSent);
  setText('[data-action="reset_followup_drafts"]', copy.actions.resetFollowups);
  setFieldLabel('[data-param="search_keywords"]', copy.searchTermsLabel);
  setFieldLabel('[data-param="target_company_types"]', copy.targetTypesLabel);
  setFieldLabel('[data-param="email_tone"]', copy.toneLabel);
  setFieldLabel('[data-param="user_profile_summary"]', copy.profileLabel);
  setFieldLabel('[data-prompt-builder="profile"]', copy.profileBuilderLabel);
  setFieldLabel('[data-prompt-builder="targets"]', copy.targetsBuilderLabel);
  setPlaceholder('[data-prompt-builder="objective"]', copy.objectivePlaceholder);
  setPlaceholder('[data-prompt-builder="profile"]', copy.profileBuilderPlaceholder);
  setPlaceholder('[data-prompt-builder="targets"]', copy.targetsBuilderPlaceholder);
  setPlaceholder("#companySearch", copy.targetSearchPlaceholder);
  setText("#companies thead th:nth-child(1)", copy.targetTableHeader);
  setText("#companies thead th:nth-child(2)", copy.contactHeader);
  setText("#companies thead th:nth-child(3)", copy.scoreHeader);
  setText("#companies thead th:nth-child(4)", copy.statusHeader);
  setText("#companies thead th:nth-child(5)", copy.followupLabel);
  setText("#companies thead th:nth-child(6)", copy.actionHeader);
  setText("#emails thead th:nth-child(1)", copy.targetTableHeader);
  setText("#emails thead th:nth-child(2)", copy.recipientHeader);
  setText("#emails thead th:nth-child(3)", copy.statusHeader);
  setText("#emails thead th:nth-child(4)", copy.replyHeader);
  setText("#emails thead th:nth-child(5)", copy.createdAtHeader);
  setText("#emails thead th:nth-child(6)", copy.actionHeader);
  const useCaseField = $("prompt-use_case");
  if (useCaseField && !useCaseField.dataset.userChanged) {
    useCaseField.value = activeSessionKind();
  }
}

function effectiveDailyLimit() {
  return Number(state?.rate_limit?.limit || 10);
}

function dailyContactRemaining() {
  if (!state?.rate_limit) return 0;
  return Math.max(0, effectiveDailyLimit() - Number(state.rate_limit.used_today || 0));
}

function launchLimitFromInput() {
  const remaining = dailyContactRemaining();
  return remaining <= 0 ? 0 : Math.min(remaining, effectiveDailyLimit());
}

function syncLaunchControls() {
  const copy = currentCopy();
  const remaining = dailyContactRemaining();
  const missingEmails = companiesMissingGeneratedEmails().length;
  const limitInput = $("limitInput");
  if (limitInput) {
    limitInput.value = remaining;
  }
  const launchButton = document.querySelector('[data-action="complete_search"]');
  if (launchButton) {
    launchButton.disabled = state.job.status === "running" || remaining <= 0;
  }
  const missingMailButton = document.querySelector('[data-action="generate_emails"]');
  if (missingMailButton) {
    missingMailButton.disabled = state.job.status === "running" || remaining <= 0 || missingEmails <= 0;
  }
  const hint = $("launchQuotaHint");
  if (hint) {
    hint.textContent =
      remaining > 0
        ? `${remaining} restant(s) aujourd'hui. ${copy.launchHint}`
        : copy.launchNoQuotaHint;
  }
  const missingHint = $("missingEmailsHint");
  if (missingHint) {
    if (missingEmails <= 0) {
      missingHint.textContent = copy.missingMailNoneHint;
    } else if (remaining <= 0) {
      missingHint.textContent = `Quota quotidien atteint. ${missingEmails} mail(s) manquant(s) attendront demain.`;
    } else {
      missingHint.textContent = `${Math.min(missingEmails, remaining)} mail(s) manquant(s) créable(s) maintenant sur ${missingEmails}. ${copy.missingMailHint}`;
    }
  }
}

function renderSessions() {
  const session = state.session || {};
  const sessions = session.sessions || [];
  const select = $("sessionSelect");
  if (!select) return;
  const currentValue = select.value || session.active_id || "";
  select.innerHTML = sessions
    .map(
      (item) =>
        `<option value="${attr(item.id)}" ${item.id === (session.active_id || currentValue) ? "selected" : ""}>${escapeHtml(item.name)}</option>`,
    )
    .join("");
  $("sessionToggles").innerHTML = sessions
    .map((item) => {
      const enabled = item.autopilot_enabled !== false;
      const isActive = item.id === session.active_id;
      return `
        <div class="session-chip ${isActive ? "active" : ""}">
          <button
            class="session-toggle ${enabled ? "enabled" : "paused"}"
            data-session-toggle="${attr(item.id)}"
            data-session-enabled="${enabled ? "true" : "false"}"
            title="${enabled ? "Mettre cette session en pause" : "Mettre cette session en play"}"
          >
            <span>${enabled ? "Pause" : "Play"}</span>
            <strong>${escapeHtml(item.name)}</strong>
          </button>
          ${
            item.can_delete
              ? `<button
                  class="session-delete"
                  data-session-delete="${attr(item.id)}"
                  data-session-name="${attr(item.name)}"
                  title="Supprimer cette session"
                >Suppr.</button>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

function renderMetrics() {
  if (!$("metrics")) return;
  const copy = currentCopy();
  const replyReviewCount = companiesNeedingReplyReview().length;
  const qualificationCount = companiesNeedingQualification().length;
  const formReadyCount = companiesWithReadyFormMessages().length;
  const readyToContactCount = companiesReadyToContact().length;
  const validSentCount = state.stats.valid_sent_companies ?? companiesSentSuccessfully().length;
  const metrics = [
    [copy.targetMetric, state.stats.total_companies, "", ""],
    [copy.statusLabels.qualified, readyToContactCount, copy.qualifiedHint, "__ready_to_contact"],
    [copy.qualificationMetric, qualificationCount, copy.qualificationHint, "__needs_qualification"],
    [copy.formReadyMetric, formReadyCount, copy.formReadyHint, "__form_ready"],
    [copy.sentMetric, validSentCount, copy.sentHint, "sent"],
    [copy.repliesMetric, replyReviewCount, copy.repliesHint, "__reply_review"],
  ];
  $("metrics").innerHTML = metrics
    .map(
      ([label, value, hint, status]) => `
        <button class="metric metric-button" data-company-filter="${attr(status)}">
          <span>${label}</span>
          <strong>${value}</strong>
          ${hint ? `<small>${hint}</small>` : ""}
        </button>
      `,
    )
    .join("");
}

function renderFilters() {
  const copy = currentCopy();
  const companyFilter = $("companyStatusFilter");
  if (!companyFilter) return;
  const selectedCompanyStatus = companyFilter.value;
  const companyStatusCounts = companyStatusFilterCounts();
  const replyReviewCount = companiesNeedingReplyReview().length;
  const qualificationCount = companiesNeedingQualification().length;
  const formReadyCount = companiesWithReadyFormMessages().length;
  const readyToContactCount = companiesReadyToContact().length;
  companyFilter.innerHTML = `
    <option value="">Tous les statuts (${state.companies.length})</option>
    <option value="__ready_to_contact" ${selectedCompanyStatus === "__ready_to_contact" ? "selected" : ""}>${escapeHtml(copy.statusLabels.qualified)} (${readyToContactCount})</option>
    <option value="__needs_qualification" ${selectedCompanyStatus === "__needs_qualification" ? "selected" : ""}>${escapeHtml(copy.qualificationMetric)} (${qualificationCount})</option>
    <option value="__form_ready" ${selectedCompanyStatus === "__form_ready" ? "selected" : ""}>${escapeHtml(copy.formReadyMetric)} (${formReadyCount})</option>
    <option value="__reply_review" ${selectedCompanyStatus === "__reply_review" ? "selected" : ""}>${escapeHtml(copy.repliesMetric)} à analyser (${replyReviewCount})</option>
    ${companyStatuses
      .map(
        (status) =>
          `<option value="${attr(status)}" ${status === selectedCompanyStatus ? "selected" : ""}>${escapeHtml(copy.statusLabels[status] || status)} (${companyStatusCounts[status] || 0})</option>`,
      )
      .join("")}
  `;
  const emailFilter = $("emailStatusFilter");
  if (!emailFilter) return;
  const selectedEmailStatus = emailFilter.value;
  emailFilter.innerHTML = `
    <option value="">${escapeHtml(copy.allMessagesFilter)}</option>
    ${emailStatuses
      .map(
        (status) =>
          `<option value="${attr(status)}" ${status === selectedEmailStatus ? "selected" : ""}>${escapeHtml(copy.emailStatusLabels[status] || status)}</option>`,
      )
      .join("")}
  `;
}

function companyStatusFilterCounts() {
  const counts = Object.fromEntries(companyStatuses.map((status) => [status, 0]));
  state.companies.forEach((company) => {
    companyStatusFilterKeys(company).forEach((status) => {
      if (status in counts) counts[status] += 1;
    });
  });
  return counts;
}

function renderSettings() {
  if (!parameters || $("settings").dataset.loaded) return;
  document.querySelectorAll("[data-param]").forEach((field) => {
    field.value = parameters[field.dataset.param] ?? "";
  });
  $("settings").dataset.loaded = "1";
}

function collectParameters() {
  const values = {};
  document.querySelectorAll("[data-param]").forEach((field) => {
    values[field.dataset.param] = field.value.trim();
  });
  return values;
}

function renderPrompts() {
  if (!promptState?.prompts) return;
  promptRenderedSessionKind = activeSessionKind();
  const keys = Object.keys(promptState.prompts);
  if (!keys.includes(selectedPromptKey)) {
    selectedPromptKey = keys[0] || "";
  }
  $("promptTabs").innerHTML = keys
    .map((key) => {
      const prompt = promptState.prompts[key];
      return `<button class="${key === selectedPromptKey ? "active" : ""}" data-prompt-tab="${attr(key)}">${escapeHtml(promptLabel(key, prompt.label))}</button>`;
    })
    .join("");
  const prompt = promptState.prompts[selectedPromptKey];
  if (!prompt) {
    $("promptEditor").innerHTML = "<strong>Aucun prompt disponible.</strong>";
    return;
  }
  $("promptEditor").innerHTML = `
    <label class="field wide">
      <span>${escapeHtml(promptLabel(selectedPromptKey, prompt.label))} - ${escapeHtml(prompt.filename)}</span>
      <textarea id="promptContentInput" class="prompt-body">${escapeHtml(prompt.content || "")}</textarea>
    </label>
  `;
}

function collectPrompts() {
  if (!promptState?.prompts) return {};
  const activeInput = $("promptContentInput");
  if (activeInput && selectedPromptKey && promptState.prompts[selectedPromptKey]) {
    promptState.prompts[selectedPromptKey].content = activeInput.value;
  }
  const values = {};
  Object.entries(promptState.prompts).forEach(([key, prompt]) => {
    values[key] = prompt.content || "";
  });
  return values;
}

function collectPromptBuilderValues() {
  const values = {};
  document.querySelectorAll("[data-prompt-builder]").forEach((field) => {
    values[field.dataset.promptBuilder] = field.value.trim();
  });
  return values;
}

function fillPromptBuilderExample() {
  const kind = $("prompt-use_case").value || activeSessionKind();
  const example = promptBuilderExample(kind);
  Object.entries(example).forEach(([key, value]) => {
    const field = document.querySelector(`[data-prompt-builder="${key}"]`);
    if (field) field.value = value;
  });
  $("prompt-use_case").dataset.userChanged = "1";
  $("promptBuilderQuestions").innerHTML =
    "<strong>Exemple rempli.</strong> Adapte les textes avec tes vrais mots, puis clique sur Créer les instructions.";
}

function promptBuilderExample(kind) {
  const examples = {
    job_search: {
      use_case: "job_search",
      objective: "Obtenir un échange court pour présenter mon profil et identifier une opportunité actuelle ou future.",
      profile:
        "Profil polyvalent avec une expérience concrète dans mon domaine, une bonne autonomie, le sens du contact et l'envie de rejoindre une structure où je peux être utile rapidement.",
      targets:
        "Entreprises locales, associations, PME, structures spécialisées ou organisations qui correspondent à mon métier, dans les villes ou régions où je peux travailler.",
      proof:
        "Expérience passée, réalisations, références, formation, portfolio, certification ou tout élément concret qui rend la démarche crédible.",
      tone: "Humain, simple, direct, professionnel, concret, sobre.",
      no_go:
        "Pas de phrase creuse, pas de flatterie, pas de message trop long, pas de mensonge.",
      call_to_action:
        "Proposer un échange de quelques minutes ou demander à qui transmettre mon profil.",
    },
    sales_prospecting: {
      use_case: "sales_prospecting",
      objective: "Obtenir un appel découverte court pour comprendre s'il existe un besoin concret.",
      profile:
        "Je propose une offre claire qui aide les structures ciblées à résoudre un problème concret, gagner du temps, améliorer leur organisation ou développer une activité.",
      targets:
        "PME, indépendants, commerces, associations, cabinets, ateliers ou structures qui peuvent avoir un besoin lié à mon offre.",
      proof:
        "Références, cas clients, résultats, exemples de missions, site web ou preuves simples de sérieux.",
      tone: "Simple, professionnel, humain, utile, non agressif.",
      no_go: "Pas de forcing commercial, pas de promesse de résultat, pas de jargon marketing.",
      call_to_action: "Proposer un échange de 15 minutes ou demander le bon interlocuteur.",
    },
    find_clients: {
      use_case: "find_clients",
      objective: "Trouver de nouveaux clients avec un besoin concret ou un projet à cadrer.",
      profile:
        "Je propose une prestation ou un accompagnement concret, avec une manière de travailler claire, sérieuse et adaptée aux besoins de chaque client.",
      targets:
        "Clients potentiels dans un secteur précis, avec une zone géographique ou un type de besoin bien défini.",
      proof: "Réalisations, avis, références, exemples, portfolio, expérience ou garanties simples.",
      tone: "Concret, clair, humain, orienté besoin réel.",
      no_go: "Pas de message générique, pas de discours trop vendeur, pas de promesse excessive.",
      call_to_action: "Demander s'il y a un besoin à regarder ou proposer un premier échange.",
    },
    partnership: {
      use_case: "partnership",
      objective: "Créer un premier contact pour imaginer une collaboration ou un relais mutuel.",
      profile:
        "Je porte une activité, un projet ou une structure complémentaire qui pourrait créer de la valeur avec les bons partenaires.",
      targets:
        "Structures complémentaires, associations, entreprises, créateurs, lieux, réseaux ou acteurs locaux avec une logique commune.",
      proof: "Réalisations, projet existant, audience, expérience, valeurs communes ou exemples de collaborations.",
      tone: "Ouvert, précis, curieux, professionnel.",
      no_go: "Pas de demande floue, pas de message trop long, pas de posture opportuniste.",
      call_to_action: "Proposer un échange court pour voir s'il existe une piste de collaboration.",
    },
    supplier: {
      use_case: "supplier",
      objective: "Identifier un fournisseur ou prestataire fiable et obtenir un premier retour clair.",
      profile:
        "Je cherche une solution, un devis, un renseignement ou un interlocuteur qualifié pour un besoin précis.",
      targets:
        "Fournisseurs, prestataires, fabricants, distributeurs, spécialistes ou entreprises capables de répondre au besoin.",
      proof:
        "Contexte du besoin, volume approximatif, contraintes importantes, calendrier ou critères de choix.",
      tone: "Clair, professionnel, précis, respectueux du temps de l'interlocuteur.",
      no_go: "Pas de message flou, pas de pression, pas de demande impossible à qualifier.",
      call_to_action: "Demander le bon contact, une première information ou la marche à suivre.",
    },
    custom: {
      use_case: "custom",
      objective: "Obtenir une réponse simple à une prise de contact personnalisée.",
      profile:
        "Décrire clairement qui parle, pourquoi la démarche existe et ce que la personne ou la structure peut apporter.",
      targets:
        "Décrire les types de personnes, structures, secteurs ou zones à contacter.",
      proof:
        "Tout élément concret qui rend la prise de contact crédible : expérience, contexte, exemples, lien, référence.",
      tone: "Humain, clair, professionnel, adapté au contexte.",
      no_go: "Pas de mensonge, pas de forcing, pas de message générique.",
      call_to_action: "Demander une réponse simple, un bon contact ou un court échange.",
    },
  };
  return examples[kind] || examples.custom;
}

async function analyzeSessionAssistant() {
  const input = $("sessionAssistantInput");
  const output = $("sessionAssistantOutput");
  const applyButton = $("applySessionBlueprintBtn");
  const description = input.value.trim();
  if (!description) {
    output.innerHTML =
      "<strong>Décris d'abord la démarche.</strong><span>Écris comme si tu parlais à quelqu'un : objectif, profil, zone, cibles, limites.</span>";
    return;
  }
  output.innerHTML = "<strong>Analyse en cours...</strong><span>Je cadre la session et je cherche les questions manquantes.</span>";
  applyButton.disabled = true;
  try {
    const response = await fetch("/api/session-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        use_case: $("prompt-use_case").value || activeSessionKind(),
        parameters: collectParameters(),
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Analyse impossible.");
    }
    sessionAssistantBlueprint = payload.blueprint;
    renderSessionAssistantBlueprint(sessionAssistantBlueprint);
    applyButton.disabled = false;
  } catch (error) {
    sessionAssistantBlueprint = null;
    output.innerHTML = `<strong>Analyse impossible.</strong><span>${escapeHtml(error.message || String(error))}</span>`;
  }
}

function resetSessionChat({ clearStorage = true } = {}) {
  sessionChatMessages = [];
  sessionChatWaiting = false;
  sessionAssistantBlueprint = null;
  sessionChatProgress = 0;
  sessionChatMode = "local";
  sessionChatBlueprintDone = false;
  if (clearStorage) clearStoredSessionChat();
  $("sessionChatInput").value = "";
  $("applySessionBlueprintBtn").disabled = true;
  renderSessionChatMessages();
  renderSessionChatWaiting();
  renderSessionChatProgress(sessionChatProgress, sessionChatMode);
  $("sessionAssistantOutput").innerHTML =
    "<strong>Démarre la discussion ou colle une description.</strong><span>L'assistant peut créer une session complète ou modifier le pilotage et les instructions existantes. Décris simplement ce que tu veux obtenir ou changer.</span>";
}

function confirmResetSessionChat() {
  if (
    sessionChatMessages.length &&
    !confirm("Effacer la discussion IA en cours pour cette session ?")
  ) {
    return;
  }
  resetSessionChat();
}

async function startSessionChat() {
  if (sessionChatMessages.length) return;
  await advanceSessionChat();
}

async function sendSessionChatMessage() {
  const input = $("sessionChatInput");
  const content = input.value.trim();
  if (!content) return;
  sessionChatMessages.push({ role: "user", content });
  input.value = "";
  saveSessionChatState();
  renderSessionChatMessages();
  await advanceSessionChat();
}

async function advanceSessionChat() {
  const sendButton = $("sessionChatSendBtn");
  const startButton = $("sessionChatStartBtn");
  const input = $("sessionChatInput");
  sessionChatWaiting = true;
  sendButton.disabled = true;
  startButton.disabled = true;
  input.disabled = true;
  renderSessionChatWaiting();
  try {
    const response = await fetch("/api/session-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: sessionChatMessages,
        use_case: $("prompt-use_case").value || activeSessionKind(),
        mode: "openai",
        parameters: collectParameters(),
        prompts: collectPrompts(),
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Discussion impossible.");
    }
    if (payload.reply) {
      sessionChatMessages.push({ role: "assistant", content: payload.reply });
    }
    if (payload.blueprint) {
      sessionAssistantBlueprint = payload.blueprint;
      sessionChatBlueprintDone = Boolean(payload.done);
      renderSessionAssistantBlueprint(sessionAssistantBlueprint);
      $("applySessionBlueprintBtn").disabled = !sessionChatBlueprintDone;
    }
    renderSessionChatProgress(payload.progress || 0, payload.mode || "local");
    saveSessionChatState();
    renderSessionChatMessages();
  } catch (error) {
    sessionChatMessages.push({
      role: "assistant",
      content: `Je n'arrive pas à continuer la discussion pour le moment. ${error.message || String(error)}`,
    });
    saveSessionChatState();
    renderSessionChatMessages();
  } finally {
    sessionChatWaiting = false;
    sendButton.disabled = false;
    startButton.disabled = sessionChatMessages.length > 0;
    input.disabled = false;
    renderSessionChatWaiting();
    input.focus();
  }
}

function renderSessionChatMessages() {
  const container = $("sessionChatMessages");
  if (!container) return;
  if (!sessionChatMessages.length) {
    container.innerHTML = `
      <div class="session-chat-message assistant">
        <small>Assistant</small>
        <span>Clique sur Démarrer le cadrage, puis réponds naturellement. Tu peux créer une session complète ou dire ce que tu veux modifier dans les messages/scoring.</span>
      </div>
    `;
    return;
  }
  container.innerHTML = sessionChatMessages
    .map((message) => {
      const role = message.role === "user" ? "user" : "assistant";
      const label = role === "user" ? "Toi" : "Assistant";
      return `
        <div class="session-chat-message ${role}">
          <small>${label}</small>
          <span>${escapeHtml(message.content)}</span>
        </div>
      `;
    })
    .join("");
  container.scrollTop = container.scrollHeight;
}

function renderSessionChatProgress(progress, mode) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress || 0)));
  sessionChatProgress = safeProgress;
  sessionChatMode = mode || "local";
  const labelEl = $("sessionChatProgressLabel");
  if (labelEl) labelEl.textContent = `${safeProgress}%`;
  const barEl = $("sessionChatProgressBar");
  if (barEl) barEl.style.width = `${safeProgress}%`;
  const modeEl = $("sessionChatMode");
  if (modeEl) {
    if (sessionChatMode === "openai") {
      modeEl.textContent = "Mode IA OpenAI actif";
    } else if (sessionChatMode === "local_openai_ready" || sessionChatMode === "openai_fallback") {
      modeEl.textContent = "Mode local, IA indisponible";
    } else {
      modeEl.textContent = "Mode local gratuit";
    }
  }
}

function renderSessionChatWaiting() {
  const indicator = $("sessionChatWaiting");
  if (!indicator) return;
  indicator.hidden = !sessionChatWaiting;
  document.body.classList.toggle("session-chat-busy", sessionChatWaiting);
  const sendButton = $("sessionChatSendBtn");
  if (!sendButton) return;
  sendButton.textContent = sessionChatWaiting ? "Attente..." : "Envoyer";
}

function renderSessionAssistantBlueprint(blueprint) {
  const outputEl = $("sessionAssistantOutput");
  if (!outputEl) return;
  const regionList = splitSemicolon(blueprint.parameters?.search_regions || "").slice(0, 10);
  const keywordList = splitSemicolon(blueprint.parameters?.search_keywords || "").slice(0, 8);
  const targetList = splitSemicolon(blueprint.parameters?.target_company_types || "").slice(0, 8);
  const excludedList = splitSemicolon(blueprint.parameters?.excluded_keywords || "").slice(0, 8);
  const questions = blueprint.questions || [];
  const warnings = blueprint.warnings || [];
  outputEl.innerHTML = `
    <strong>${escapeHtml(blueprint.summary || "Session cadrée.")}</strong>
    ${warnings.length ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
    ${
      questions.length
        ? `<span>Questions à répondre pour rendre la session fiable :</span><ul>${questions
            .map((question) => `<li>${escapeHtml(question)}</li>`)
            .join("")}</ul>`
        : "<span>Le cadrage est assez complet pour générer les paramètres et instructions de messages.</span>"
    }
    <span>Lieux où chercher :</span>
    <div class="assistant-pill-row">${regionList.map((item) => `<span class="assistant-pill">${escapeHtml(item)}</span>`).join("")}</div>
    <span>Ce que l'app cherchera :</span>
    <div class="assistant-pill-row">${keywordList.map((item) => `<span class="assistant-pill">${escapeHtml(item)}</span>`).join("")}</div>
    <span>Qui l'app va cibler :</span>
    <div class="assistant-pill-row">${targetList.map((item) => `<span class="assistant-pill">${escapeHtml(item)}</span>`).join("")}</div>
    <span>Ce que l'app évitera :</span>
    <div class="assistant-pill-row">${excludedList.map((item) => `<span class="assistant-pill muted">${escapeHtml(item)}</span>`).join("")}</div>
  `;
}

function applySessionAssistantBlueprint() {
  if (!sessionAssistantBlueprint) return;
  const { parameters: suggestedParameters, builder_values: builderValues, prompts } = sessionAssistantBlueprint;
  Object.entries(suggestedParameters || {}).forEach(([key, value]) => {
    const field = document.querySelector(`[data-param="${key}"]`);
    if (field && value) field.value = value;
  });
  Object.entries(builderValues || {}).forEach(([key, value]) => {
    const field = document.querySelector(`[data-prompt-builder="${key}"]`);
    if (field && value) field.value = value;
  });
  if (promptState?.prompts) {
    Object.entries(prompts || {}).forEach(([key, content]) => {
      if (promptState.prompts[key] && content) {
        promptState.prompts[key].content = content;
      }
    });
  }
  selectedPromptKey = "email_generation_fr";
  parameters = collectParameters();
  renderPrompts();
  $("promptBuilderQuestions").innerHTML =
    "<strong>Proposition appliquée au pilotage et aux instructions.</strong> Relis, puis clique sur Sauvegarder le pilotage et Sauvegarder instructions.";
}

function splitSemicolon(value) {
  return String(value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPromptPackFromForm() {
  if (!promptState?.prompts) {
    $("promptBuilderQuestions").innerHTML = "<strong>Instructions non chargées. Rafraîchis la page.</strong>";
    return;
  }
  collectPrompts();
  const values = collectPromptBuilderValues();
  const questions = promptBuilderQuestions(values);
  if (questions.length) {
    $("promptBuilderQuestions").innerHTML = `
      <strong>Infos à compléter pour éviter des messages trop vagues :</strong>
      <ul>${questions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul>
    `;
    return;
  }
  const pack = buildPromptPack(values);
  Object.entries(pack).forEach(([key, content]) => {
    if (promptState.prompts[key]) {
      promptState.prompts[key].content = content;
    }
  });
  selectedPromptKey = "email_generation_fr";
  $("promptBuilderQuestions").innerHTML =
    "<strong>Instructions créées.</strong> Relis le résultat ci-dessous, ajuste si besoin, puis clique sur Sauvegarder instructions. Les entreprises précises seront ajoutées automatiquement au moment de générer chaque message.";
  renderPrompts();
}

function promptBuilderQuestions(values) {
  const copy = currentCopy();
  const questions = [];
  if (!values.objective) {
    questions.push("Quel est l'objectif concret de la démarche ?");
  }
  if (!values.profile) {
    questions.push("Que propose ou recherche la personne ? Décris son profil, offre ou activité.");
  }
  if (!values.targets) {
    questions.push(`Qui doit être ciblé : types de ${copy.targetPlural}, secteurs, régions ou interlocuteurs ?`);
  }
  if (!values.call_to_action) {
    questions.push("Quelle réponse veux-tu obtenir : échange court, bon contact, rendez-vous, devis ?");
  }
  return questions;
}

function buildPromptPack(values) {
  const context = promptBuilderContext(values);
  return {
    email_generation_fr: buildEmailGenerationPrompt(context),
    followup_generation_fr: buildFollowupPrompt(context),
    company_scoring_fr: buildScoringPrompt(context),
  };
}

function promptBuilderContext(values) {
  return {
    useCase: values.use_case || activeSessionKind(),
    useCaseLabel: useCaseLabel(values.use_case || activeSessionKind()),
    messageType: messageType(values.use_case || activeSessionKind()),
    profileLabel: profileContextLabel(values.use_case || activeSessionKind()),
    orientation: useCaseOrientation(values.use_case || activeSessionKind()),
    objective: values.objective,
    profile: values.profile,
    targets: values.targets,
    proof: values.proof || "Preuves disponibles à utiliser seulement si elles sont fournies dans le contexte.",
    tone: values.tone || parameters?.email_tone || "humain, direct, concret, sobre, personnalisé",
    noGo: values.no_go || "Pas de forcing, pas de mensonge, pas de promesse gratuite, pas de phrase générique.",
    callToAction: values.call_to_action,
  };
}

function useCaseLabel(useCase) {
  const labels = {
    job_search: "recherche d'emploi",
    sales_prospecting: "démarchage commercial",
    find_clients: "recherche de clients",
    partnership: "prise de contact partenariat",
    supplier: "prise de contact fournisseur/prestataire",
    custom: "prise de contact personnalisée",
  };
  return labels[useCase] || labels.custom;
}

function messageType(useCase) {
  if (useCase === "job_search") return "candidature spontanée";
  if (useCase === "sales_prospecting" || useCase === "find_clients") return "message de prospection";
  if (useCase === "partnership") return "message de partenariat";
  if (useCase === "supplier") return "message de prise de contact";
  return "message personnalisé";
}

function profileContextLabel(useCase) {
  if (useCase === "job_search") return "Profil / recherche professionnelle";
  if (useCase === "sales_prospecting" || useCase === "find_clients") return "Offre / service / activité";
  if (useCase === "partnership") return "Proposition / activité";
  if (useCase === "supplier") return "Besoin / contexte fournisseur";
  return "Profil / offre / activité";
}

function useCaseOrientation(useCase) {
  if (useCase === "job_search") {
    return "candidature ou recherche d'opportunité professionnelle uniquement; ne jamais proposer une prestation, un devis, une offre commerciale ou des services.";
  }
  if (useCase === "sales_prospecting" || useCase === "find_clients") {
    return "proposition de service ou recherche de clients; ne pas faire croire qu'il s'agit d'une candidature à un poste.";
  }
  if (useCase === "partnership") {
    return "ouverture de partenariat ou collaboration; ne pas écrire comme une candidature ni comme un devis agressif.";
  }
  if (useCase === "supplier") {
    return "demande de contact fournisseur/prestataire; ne pas écrire comme une candidature.";
  }
  return "adapter le message au type de démarche choisi, sans inventer.";
}

function buildEmailGenerationPrompt(context) {
  return `Génère un ${context.messageType} personnalisé en français.

Contexte de démarche :
- Type : ${context.useCaseLabel}.
- Objectif : ${context.objective}.
- ${context.profileLabel} : ${context.profile}.
- Cibles : ${context.targets}.
- Preuves ou références disponibles : ${context.proof}.
- Ton demandé : ${context.tone}.
- Appel à l'action attendu : ${context.callToAction}.
- Orientation obligatoire : ${context.orientation}.

Contraintes obligatoires :
- 120 à 180 mots.
- Objet court.
- Respecter strictement l'orientation obligatoire.
- Message humain, précis, contextualisé, non automatisé.
- Mentionner une raison spécifique liée à l'entreprise ciblée.
- Utiliser seulement les informations publiques fournies dans le contexte entreprise.
- Si le contexte entreprise est pauvre, personnaliser par secteur, besoin probable ou angle logique, sans inventer.
- Ne jamais mentir.
- Ne jamais écrire de pression commerciale, promesse excessive, urgence artificielle ou flatterie creuse.
- Éviter les phrases interchangeables comme "votre entreprise a retenu mon attention" sans détail concret.
- Respecter les limites suivantes : ${context.noGo}.
- Demander une réponse simple selon l'appel à l'action.
- Signature simple avec les informations disponibles.

Retourne uniquement un objet JSON strict :
{
  "subject": "objet",
  "body": "corps du message",
  "personalization_notes": "raison courte expliquant la personnalisation"
}
`;
}

function buildFollowupPrompt(context) {
  return `Génère une relance courte en français après un premier ${context.messageType}.

Contexte de démarche :
- Type : ${context.useCaseLabel}.
- Objectif initial : ${context.objective}.
- ${context.profileLabel} : ${context.profile}.
- Cibles : ${context.targets}.
- Ton demandé : ${context.tone}.
- Orientation obligatoire : ${context.orientation}.

Contraintes obligatoires :
- 70 à 120 mots.
- Objet court.
- Ton simple, humain, non insistant.
- Respecter strictement l'orientation obligatoire.
- Ne pas reformuler tout le premier message.
- Ne pas faire culpabiliser.
- Ne pas créer d'urgence artificielle.
- Rappeler brièvement l'objet du premier contact sans lourdeur.
- Laisser une porte de sortie naturelle si ce n'est pas le bon moment.
- Respecter les limites suivantes : ${context.noGo}.
- Terminer par une demande simple : ${context.callToAction}.

Retourne uniquement un objet JSON strict :
{
  "subject": "objet",
  "body": "corps de relance",
  "personalization_notes": "note courte"
}
`;
}

function buildScoringPrompt(context) {
  return `Tu es un évaluateur senior chargé de scorer une entreprise pour une démarche de ${context.useCaseLabel}.

Objectif :
${context.objective}

${context.profileLabel} à mettre en face de l'entreprise :
${context.profile}

Cibles recherchées :
${context.targets}

Critères de scoring :
- adéquation entre l'activité de l'entreprise, l'objectif et l'orientation suivante : ${context.orientation} ;
- présence de signaux publics pertinents ;
- cohérence secteur / taille / besoin probable ;
- potentiel de réponse ou d'intérêt ;
- qualité du point de contact disponible ;
- proximité géographique ou logique si elle est pertinente ;
- rejet si l'entreprise est hors cible, trop impersonnelle, plateforme fermée, école/formation/stage hors sujet, ou si aucun rapport clair n'existe.

Règles :
- Score de 0 à 100.
- Score >= 65 : cible intéressante.
- Score 45 à 64 : à revoir manuellement.
- Score < 45 : à rejeter.
- Ne pas inventer d'informations.
- Chaque score doit donner une raison concrète et un angle recommandé.

Retourne uniquement JSON :
{
  "score": 0-100,
  "reason": "raison courte",
  "matched_keywords": ["..."],
  "recommended_angle": "angle de contact"
}
`;
}

function renderCompanies() {
  const copy = currentCopy();
  const filteredCompanies = visibleCompanyCandidates();
  const shownCompanies = filteredCompanies.slice(0, companiesVisibleLimit);
  const rows = shownCompanies
    .map(companyRow)
    .join("");
  $("companiesBody").innerHTML =
    rows || `<tr><td colspan="6"><small>${escapeHtml(copy.noTargets)}</small></td></tr>`;
  renderCompaniesLoadMore(filteredCompanies.length, shownCompanies.length);
}

function visibleCompanyCandidates() {
  const query = $("companySearch").value.trim().toLowerCase();
  const statusFilter = $("companyStatusFilter").value;
  const hasTextSearch = Boolean(query);
  return state.companies
    .filter((company) => hasTextSearch || companyMatchesStatusFilter(company, statusFilter))
    .filter((company) => {
      if (!query) return true;
      return companySearchText(company).includes(query);
    });
}

function renderCompaniesLoadMore(total, shown) {
  const controls = [
    {
      row: $("companiesLoadMoreTop"),
      hint: $("companiesVisibleHintTop"),
      button: $("showMoreCompaniesTopBtn"),
    },
    {
      row: $("companiesLoadMore"),
      hint: $("companiesVisibleHint"),
      button: $("showMoreCompaniesBtn"),
    },
  ];
  controls.forEach(({ row, hint, button }) => {
    if (!row || !hint || !button) return;
    row.hidden = total <= COMPANIES_PAGE_SIZE;
    hint.textContent = `${Math.min(shown, total)} / ${total} affichées`;
    button.hidden = shown >= total;
    button.disabled = shown >= total;
  });
}

function companyMatchesStatusFilter(company, statusFilter) {
  if (!statusFilter) return true;
  if (statusFilter === "__reply_review") return companyNeedsReplyReview(company);
  if (statusFilter === "__needs_qualification") return companyNeedsQualification(company);
  if (statusFilter === "__form_ready") return companyHasReadyFormMessage(company);
  if (statusFilter === "__ready_to_contact") return companyReadyToContact(company);
  if (statusFilter === "sent") return companySentSuccessfully(company);
  return companyStatusFilterKeys(company).has(statusFilter);
}

function companiesReadyToContact() {
  return state.companies.filter(companyReadyToContact);
}

function companyReadyToContact(company) {
  return company.status === "qualified" || companyHasReadyFormMessage(company);
}

function companiesMissingGeneratedEmails() {
  return state.companies.filter(companyMissingGeneratedEmail);
}

function companyMissingGeneratedEmail(company) {
  const latestStatus = company.latest_email_status || "";
  const hasActiveMessage = ["generated", "draft_created", "sent", "form_generated"].includes(latestStatus);
  const recipient = String(company.detected_email || "");
  return (
    company.status === "qualified" &&
    Boolean(recipient) &&
    !isFormRecipient(recipient) &&
    !hasActiveMessage
  );
}

function companiesNeedingQualification() {
  return state.companies.filter(companyNeedsQualification);
}

function companyNeedsQualification(company) {
  if (company.status === "no_email") return true;
  if (["enriched", "qualified"].includes(company.status) && !company.detected_email) return true;
  return company.status === "formulaire_en_ligne" && !companyHasReadyFormMessage(company);
}

function companiesWithReadyFormMessages() {
  return state.companies.filter(companyHasReadyFormMessage);
}

function companyHasReadyFormMessage(company) {
  return company.status === "formulaire_en_ligne" && company.latest_email_status === "form_generated";
}

function companiesNeedingReplyReview() {
  return state.companies.filter(companyNeedsReplyReview);
}

function companiesSentSuccessfully() {
  return state.companies.filter(companySentSuccessfully);
}

function companySentSuccessfully(company) {
  const latestStatus = company.latest_email_status || "";
  const latestReplyStatus = company.latest_reply_status || "";
  return (
    company.status === "sent" &&
    latestStatus !== "failed" &&
    latestReplyStatus !== "wrong_contact"
  );
}

function companyNeedsReplyReview(company) {
  const resolvedReplyStatuses = new Set([
    "no_reply",
    "positive",
    "interview",
    "no_hiring_now",
    "away_until",
    "recontact_after_date",
    "keep_in_touch",
    "forwarded",
    "wrong_contact",
    "auto_reply",
    "negative",
    "refused",
    "not_hiring",
    "no_budget",
    "blacklist",
  ]);
  return company.status === "replied" && !resolvedReplyStatuses.has(company.latest_reply_status || "");
}

function companyStatusFilterKeys(company) {
  const statuses = new Set([company.status].filter(Boolean));
  if (company.status === "sent" && !companySentSuccessfully(company)) {
    statuses.delete("sent");
  }
  if (shouldSurfaceLatestEmailStatus(company)) {
    statuses.add(company.latest_email_status);
  }
  return statuses;
}

function shouldSurfaceLatestEmailStatus(company) {
  const hiddenCompanyStatuses = new Set([
    "rejected",
    "no_email",
    "formulaire_en_ligne",
    "sent",
    "replied",
    "blacklisted",
  ]);
  return Boolean(
    company.latest_email_status &&
      company.latest_email_status !== company.status &&
      (!hiddenCompanyStatuses.has(company.status) || companyHasReadyFormMessage(company)),
  );
}

function companyRow(company) {
  const sendButton = canSendCompanyEmail(company)
    ? `<button class="danger-button" data-company-send="${attr(company.id)}">Envoyer</button>`
    : "";
  const openMessageButton = companyHasOpenableMessage(company)
    ? `<button class="secondary-button" data-company-open-message="${attr(company.id)}">Message</button>`
    : "";
  return `
    <tr class="${company.id === selectedCompanyId ? "selected-row" : ""}">
      <td>
        <strong>${escapeHtml(company.company_name)}</strong>
        <small>${escapeHtml(company.domain || company.website_url || "")}</small>
      </td>
      <td>
        ${escapeHtml(company.detected_email || company.latest_email_to || "")}
        <small>${linkOrText(company.contact_page_url)}</small>
      </td>
      <td>${company.relevance_score || 0}</td>
      <td>${companyStatusCell(company)}</td>
      <td>${shortDate(company.next_followup_at)}</td>
      <td>
        <div class="row-action">
          <select data-company-status="${attr(company.id)}">${companyStatusOptions(company.status)}</select>
          ${companyReplySelect(company)}
          ${sendButton}
          ${openMessageButton}
          <button class="secondary-button" data-company-open="${attr(company.id)}">Ouvrir</button>
        </div>
      </td>
    </tr>
  `;
}

function companyReplySelect(company) {
  if (company.status !== "replied") return "";
  return `
    <select class="reply-select" title="Résultat de la réponse" data-company-reply-status="${attr(company.id)}">
      ${replyStatusOptions(company.latest_reply_status || "")}
    </select>
  `;
}

function companyStatusCell(company) {
  const latestEmailStatus = company.latest_email_status || "";
  const emailLine =
    latestEmailStatus && shouldSurfaceLatestEmailStatus(company)
      ? `<small>Message: ${escapeHtml(currentCopy().emailStatusLabels[latestEmailStatus] || latestEmailStatus)}</small>`
      : "";
  return `${statusPill(company.status)}${emailLine}`;
}

function renderCompanyDetail() {
  const copy = currentCopy();
  const company = findCompany(selectedCompanyId);
  if (!company) {
    $("companyDetail").hidden = true;
    $("companyDetail").className = "detail-panel empty";
    $("companyDetail").innerHTML = "";
    return;
  }
  $("companyDetail").hidden = false;
  $("companyDetail").className = "detail-panel";
  const formMessageButton = canGenerateFormMessage(company)
    ? '<button id="generateFormMessageBtn">Générer texte formulaire</button>'
    : "";
  const markFormSentButton = canMarkFormSent(company)
    ? '<button id="markFormSentBtn">Formulaire envoyé</button>'
    : "";
  const sendEmailButton = canSendCompanyEmail(company)
    ? '<button id="sendCompanyEmailBtn" class="danger-button">Envoyer email généré</button>'
    : "";
  const openMessageButton = companyHasOpenableMessage(company)
    ? '<button id="openCompanyMessageBtn">Ouvrir message</button>'
    : "";
  const regenerateFormButton = companyHasReadyFormMessage(company)
    ? '<button id="regenerateFormMessageBtn">Régénérer formulaire</button>'
    : "";
  const regenerateEmailButton = canRegenerateCompanyEmail(company)
    ? '<button id="regenerateCompanyEmailBtn">Régénérer email</button>'
    : "";
  const badEmailButton = canMarkBadCompanyEmail(company)
    ? '<button id="markBadEmailBtn" class="danger-button">Mauvaise adresse email</button>'
    : "";
  $("companyDetail").innerHTML = `
    <div class="detail-heading">
      <div>
        <p class="eyebrow">${escapeHtml(copy.targetDetailEyebrow)}</p>
        <h4>${escapeHtml(company.company_name)}</h4>
        <small>${linkOrText(company.website_url || company.domain)}</small>
      </div>
      ${statusPill(company.status)}
    </div>
    <div class="detail-grid">
      <label class="field compact">
        <span>Statut</span>
        <select id="companyStatusInput">${companyStatusOptions(company.status)}</select>
      </label>
      <label class="field">
        <span>Email</span>
        <input id="companyEmailInput" value="${attr(company.detected_email || "")}" />
        <small>${escapeHtml(copy.manualEmailHelp)}</small>
      </label>
      <label class="field">
        <span>Site web</span>
        <input id="companyWebsiteInput" value="${attr(company.website_url || "")}" />
      </label>
      <label class="field">
        <span>${escapeHtml(copy.contactFieldLabel)}</span>
        <input id="companyContactInput" value="${attr(company.contact_page_url || "")}" />
      </label>
      <label class="field compact">
        <span>${escapeHtml(copy.followupLabel)}</span>
        <input id="companyFollowupInput" type="date" value="${attr(shortDate(company.next_followup_at))}" />
      </label>
      <label class="field wide">
        <span>Notes</span>
        <textarea id="companyNotesInput">${escapeHtml(company.notes || "")}</textarea>
      </label>
      <label class="field">
        <span>Résultat de la réponse</span>
        <select id="companyReplyStatusInput">${replyStatusOptions(company.latest_reply_status || "")}</select>
        <small>Choisis "${escapeHtml(replyStatusLabel("no_hiring_now"))}" pour classer une réponse négative temporaire.</small>
      </label>
      <label class="field">
        <span>Note réponse</span>
        <input id="companyReplyNoteInput" placeholder="Ex: en congé jusqu'au 28/08, recontacter après" value="" />
      </label>
    </div>
    <div class="button-row">
      <button id="saveCompanyBtn" class="primary-button">Sauvegarder fiche</button>
      <button id="markRepliedBtn">Réponse reçue</button>
      <button id="recontactDateBtn">Recontacter à cette date</button>
      <button id="schedule40Btn">Relance +40 jours</button>
      ${openMessageButton}
      ${sendEmailButton}
      ${badEmailButton}
      ${regenerateEmailButton}
      ${formMessageButton}
      ${regenerateFormButton}
      ${markFormSentButton}
    </div>
    ${companyEmailBlock(company)}
  `;
}

function companyEmailBlock(company) {
  const copy = currentCopy();
  const email = findEmail(company.latest_email_id);
  const emailId = email ? email.id : (company.latest_email_id || "");
  if (!email) {
    return `
    <div class="detail-email-block" style="margin-top: 1rem; padding: 1rem; border: 1px solid var(--border, #cbd5e1); border-radius: 8px; background: rgba(148,163,184,0.08);">
      <p class="eyebrow">Message</p>
      <small>${escapeHtml(copy.noMessageYet || "Aucun message généré pour cette entreprise pour le moment.")}</small>
    </div>`;
  }
  selectedEmailId = emailId;
  const canSendFromSite =
    ["generated", "draft_created"].includes(email.status) &&
    !isFormRecipient(email.email_to);
  const sendNowButton = canSendFromSite
    ? '<button id="sendCompanyEmailBtn" class="danger-button">Envoyer maintenant</button>'
    : "";
  const regenerateBtn = canRegenerateEmailMessage(email)
    ? '<button id="regenerateSelectedEmailBtn">Régénérer message</button>'
    : "";
  const badAddrBtn = canMarkBadEmail(email)
    ? '<button id="markBadEmailFromEmailBtn" class="danger-button">Mauvaise adresse</button>'
    : "";
  return `
  <div class="detail-email-block" style="margin-top: 1rem; padding: 1rem; border: 1px solid var(--border, #cbd5e1); border-radius: 8px; background: rgba(148,163,184,0.08);">
    <div class="detail-heading">
      <div>
        <p class="eyebrow">Message de contact</p>
        <h4>${escapeHtml(email.subject || "(sans objet)")}</h4>
        <small>${formatRecipient(email.email_to)}</small>
      </div>
      ${statusPill(email.status)}
    </div>
    <div class="detail-grid">
      <label class="field wide">
        <span>Destinataire</span>
        <input id="emailToInput" value="${attr(email.email_to || "")}" />
      </label>
      <label class="field wide">
        <span>Objet</span>
        <input id="emailSubjectInput" value="${attr(email.subject || "")}" />
      </label>
      <label class="field wide">
        <span>Corps du message</span>
        <textarea id="emailBodyInput" class="message-body" rows="8">${escapeHtml(email.body || "")}</textarea>
      </label>
      <label class="field wide">
        <span>Notes personnalisation</span>
        <textarea id="emailNotesInput" rows="2">${escapeHtml(email.personalization_notes || "")}</textarea>
      </label>
      <label class="field compact">
        <span>Statut du message</span>
        <select id="emailStatusInput">${emailStatusOptions(email.status)}</select>
      </label>
      <label class="field compact">
        <span>Réponse</span>
        <select id="emailReplyStatusInput">${replyStatusOptions(email.reply_status || "")}</select>
      </label>
    </div>
    <div class="button-row">
      <button id="saveEmailBtn" class="primary-button">Sauvegarder message</button>
      <button id="copyEmailBodyBtn">Copier corps</button>
      <button id="markEmailSentBtn">Marquer envoyé</button>
      ${sendNowButton}
      ${regenerateBtn}
      ${badAddrBtn}
    </div>
  </div>`;
}

function canGenerateFormMessage(company) {
  const hasContactTarget = Boolean(company.contact_page_url || company.website_url || company.domain);
  if (!hasContactTarget || companyHasReadyFormMessage(company) || hasPendingFormMessage(company.id)) {
    return false;
  }
  return ["formulaire_en_ligne", "no_email", "enriched", "qualified"].includes(company.status);
}

function canMarkFormSent(company) {
  return company.status === "formulaire_en_ligne" || hasPendingFormMessage(company.id);
}

function renderEmails() {
  if (!$("emailsBody")) return; // section emails fusionnée dans la fiche entreprise
  const copy = currentCopy();
  const filteredEmails = visibleEmailCandidates();
  const shownEmails = filteredEmails.slice(0, emailsVisibleLimit);
  const rows = shownEmails
    .map(emailRow)
    .join("");
  $("emailsBody").innerHTML =
    rows || `<tr><td colspan="6"><small>${escapeHtml(copy.noMessages)}</small></td></tr>`;
  renderEmailsLoadMore(filteredEmails.length, shownEmails.length);
}

function visibleEmailCandidates() {
  const filterEl = $("emailStatusFilter");
  const statusFilter = filterEl ? filterEl.value : "";
  return state.emails.filter((email) => !statusFilter || email.status === statusFilter);
}

function renderEmailsLoadMore(total, shown) {
  const controls = [
    {
      row: $("emailsLoadMoreTop"),
      hint: $("emailsVisibleHintTop"),
      button: $("showMoreEmailsTopBtn"),
    },
    {
      row: $("emailsLoadMore"),
      hint: $("emailsVisibleHint"),
      button: $("showMoreEmailsBtn"),
    },
  ];
  controls.forEach(({ row, hint, button }) => {
    if (!row || !hint || !button) return;
    row.hidden = total <= EMAILS_PAGE_SIZE;
    hint.textContent = `${Math.min(shown, total)} / ${total} affichés`;
    button.hidden = shown >= total;
    button.disabled = shown >= total;
  });
}

function emailRow(email) {
  return `
    <tr class="${email.id === selectedEmailId ? "selected-row" : ""}">
      <td><strong>${escapeHtml(email.company_name)}</strong><small>${escapeHtml(email.subject)}</small></td>
      <td>${formatRecipient(email.email_to)}</td>
      <td>${statusPill(email.status)}</td>
      <td>${escapeHtml(replyStatusLabel(email.reply_status))}</td>
      <td>${shortDate(email.created_at)}</td>
      <td><button class="secondary-button" data-email-open="${attr(email.id)}">Ouvrir</button></td>
    </tr>
  `;
}

function renderEmailDetail() {
  if (!$("emailDetail")) return; // panneau email fusionné dans la fiche entreprise
  const copy = currentCopy();
  const email = findEmail(selectedEmailId);
  if (!email) {
    $("emailDetail").className = "detail-panel empty";
    $("emailDetail").innerHTML = `<strong>${escapeHtml(copy.messageNoSelection)}</strong>`;
    return;
  }
  const canSendFromSite =
    ["generated", "draft_created"].includes(email.status) &&
    !isFormRecipient(email.email_to);
  const regenerateMessageButton = canRegenerateEmailMessage(email)
    ? '<button id="regenerateSelectedEmailBtn">Régénérer message</button>'
    : "";
  const badEmailButton = canMarkBadEmail(email)
    ? '<button id="markBadEmailFromEmailBtn" class="danger-button">Mauvaise adresse email</button>'
    : "";
  $("emailDetail").className = "detail-panel";
  $("emailDetail").innerHTML = `
    <div class="detail-heading">
      <div>
        <p class="eyebrow">Détail message</p>
        <h4>${escapeHtml(email.company_name)}</h4>
        <small>${formatRecipient(email.email_to)}</small>
      </div>
      ${statusPill(email.status)}
    </div>
    <div class="detail-grid">
      <label class="field">
        <span>Destinataire</span>
        <input id="emailToInput" value="${attr(email.email_to || "")}" />
      </label>
      <label class="field compact">
        <span>Statut</span>
        <select id="emailStatusInput">${emailStatusOptions(email.status)}</select>
      </label>
      <label class="field compact">
        <span>Réponse</span>
        <select id="emailReplyStatusInput">${replyStatusOptions(email.reply_status || "")}</select>
      </label>
      <label class="field wide">
        <span>Objet</span>
        <input id="emailSubjectInput" value="${attr(email.subject || "")}" />
      </label>
      <label class="field wide">
        <span>Corps</span>
        <textarea id="emailBodyInput" class="message-body">${escapeHtml(email.body || "")}</textarea>
      </label>
      <label class="field wide">
        <span>Notes personnalisation</span>
        <textarea id="emailNotesInput">${escapeHtml(email.personalization_notes || "")}</textarea>
      </label>
    </div>
    <div class="button-row">
      <button id="saveEmailBtn" class="primary-button">Sauvegarder message</button>
      <button id="copyEmailBodyBtn">Copier corps</button>
      <button id="markEmailSentBtn">Marquer envoyé</button>
      ${
        canSendFromSite
          ? '<button id="sendEmailBtn" class="danger-button">Envoyer depuis le site</button>'
          : ""
      }
      ${regenerateMessageButton}
      ${badEmailButton}
    </div>
  `;
}

function linkOrText(value) {
  if (!value) return "";
  const safe = escapeHtml(value);
  const href = value.startsWith("http") ? value : `https://${value}`;
  return `<a href="${attr(href)}" target="_blank" rel="noreferrer">${safe}</a>`;
}

function formatRecipient(value) {
  if (!value) return "";
  const recipient = String(value);
  if (recipient.startsWith("FORMULAIRE:")) {
    const url = recipient.replace("FORMULAIRE:", "").trim();
    return `<a href="${attr(url)}" target="_blank" rel="noreferrer">Formulaire</a>`;
  }
  if (recipient.startsWith("http://") || recipient.startsWith("https://")) {
    return `<a href="${attr(recipient)}" target="_blank" rel="noreferrer">Formulaire</a>`;
  }
  return escapeHtml(recipient);
}

async function runAction(action, payload = {}) {
  if (actionInProgress) {
    alert("Une action est déjà en cours.");
    return;
  }
  actionInProgress = true;
  renderBusyOverlay();
  try {
    const response = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json();
    if (!response.ok) {
      alert(result.message || result.error || "Action impossible");
      return;
    }
    const finalStatus = await waitForActionDone();
    if (finalStatus === "failed") {
      alert(state?.job?.log || "Action échouée. Regarde le journal pour le détail.");
    }
  } finally {
    actionInProgress = false;
    await fetchState({ force: true });
    renderBusyOverlay();
  }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const scratch = document.createElement("textarea");
    scratch.value = value;
    document.body.appendChild(scratch);
    scratch.select();
    document.execCommand("copy");
    scratch.remove();
  }
}

function safeBind(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
}
function bindEvents() {
  document.addEventListener("focusin", noteUserInteraction);
  document.addEventListener("pointerdown", noteUserInteraction);
  document.addEventListener("keydown", noteUserInteraction);
  bindNavHighlight();
  const refreshBtn = $("refreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => fetchState({ force: true }));
  const toggleSetupPanelBtn = $("toggleSetupPanelBtn");
  if (toggleSetupPanelBtn) toggleSetupPanelBtn.addEventListener("click", toggleSetupPanel);
  const setupGoActionsBtn = $("setupGoActionsBtn");
  if (setupGoActionsBtn) setupGoActionsBtn.addEventListener("click", () => {
    document.querySelector("#actions").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  safeBind("copyGoogleGuideBtn", "click", () => copyText(googleOAuthMiniGuide()));
  safeBind("copySerpApiGuideBtn", "click", () => copyText(serpApiMiniGuide()));
  safeBind("googleCredentialsFileInput", "change", saveGoogleCredentialsFromFile);
  safeBind("clearGoogleCredentialsBtn", "click", clearGoogleCredentials);
  safeBind("sessionSelect", "change", switchSession);
  safeBind("createSessionBtn", "click", createSessionFromForm);
  safeBind("serpApiSaveBtn", "click", saveSerpApiKeyFromForm);
  safeBind("serpApiSetupSaveBtn", "click", saveSerpApiKeyFromForm);
  safeBind("companySearch", "input", () => {
    clearSelectedCompany();
    resetCompanyVisibleLimit();
    renderCompanies();
  });
  safeBind("companyStatusFilter", "change", () => {
    clearSelectedCompany();
    resetCompanyVisibleLimit();
    renderCompanies();
  });
  safeBind("showMoreCompaniesTopBtn", "click", showMoreCompanies);
  safeBind("showMoreCompaniesBtn", "click", showMoreCompanies);
  safeBind("emailStatusFilter", "change", () => {
    resetEmailVisibleLimit();
    renderEmails();
  });
  safeBind("showMoreEmailsTopBtn", "click", showMoreEmails);
  safeBind("showMoreEmailsBtn", "click", showMoreEmails);
  safeBind("toggleEmailsPanelBtn", "click", toggleEmailsPanel);
  safeBind("saveSettingsBtn", "click", async () => {
    parameters = collectParameters();
    await runAction("save_parameters", { parameters });
  });
  safeBind("toggleSettingsPanelBtn", "click", toggleSettingsPanel);
  safeBind("savePromptsBtn", "click", async () => {
    const sessionId = activeSessionId();
    if (sessionId) {
      await runAction("save_session_prompts", { session_id: sessionId, prompts: collectPrompts() });
    } else {
      await runAction("save_prompts", { prompts: collectPrompts() });
    }
    await fetchPrompts();
  });
  safeBind("togglePromptsPanelBtn", "click", togglePromptsPanel);
  safeBind("prompt-use_case", "change", () => {
    $("prompt-use_case").dataset.userChanged = "1";
    saveSessionChatState();
  });
  safeBind("fillPromptExampleBtn", "click", fillPromptBuilderExample);
  safeBind("analyzeSessionBtn", "click", analyzeSessionAssistant);
  safeBind("applySessionBlueprintBtn", "click", applySessionAssistantBlueprint);
  safeBind("buildPromptsBtn", "click", buildPromptPackFromForm);
  safeBind("sessionChatStartBtn", "click", startSessionChat);
  safeBind("sessionChatSendBtn", "click", sendSessionChatMessage);
  safeBind("sessionChatResetBtn", "click", confirmResetSessionChat);
  safeBind("sessionChatInput", "keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      sendSessionChatMessage();
    }
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      const quotaLimitedActions = new Set(["complete_search", "generate_emails"]);
      const limit = quotaLimitedActions.has(action) ? launchLimitFromInput() : Number($("limitInput").value || 0);
      if (quotaLimitedActions.has(action) && limit <= 0) {
        alert("Quota quotidien atteint. Relance demain.");
        return;
      }
      if (action === "generate_emails" && companiesMissingGeneratedEmails().length <= 0) {
        alert("Aucun mail manquant à créer.");
        return;
      }
      const risky = ["followups", "mark_sent", "mark_form_sent"];
      if (risky.includes(action) && !confirm("Confirmer cette action ?")) return;
      runAction(action, { limit });
    });
  });

  document.addEventListener("click", (event) => {
    const companyOpen = event.target.closest("[data-company-open]");
    if (companyOpen) {
      selectedCompanyId = companyOpen.dataset.companyOpen;
      renderCompanies();
      renderCompanyDetail();
      return;
    }

    const companySend = event.target.closest("[data-company-send]");
    if (companySend) {
      sendGeneratedEmailForCompany(companySend.dataset.companySend);
      return;
    }

    const companyOpenMessage = event.target.closest("[data-company-open-message]");
    if (companyOpenMessage) {
      openLatestCompanyMessage(companyOpenMessage.dataset.companyOpenMessage);
      return;
    }

    const sessionToggle = event.target.closest("[data-session-toggle]");
    if (sessionToggle) {
      toggleSessionAutopilot(sessionToggle);
      return;
    }

    const sessionDelete = event.target.closest("[data-session-delete]");
    if (sessionDelete) {
      deleteSessionFromButton(sessionDelete);
      return;
    }

    const companyFilterButton = event.target.closest("[data-company-filter]");
    if (companyFilterButton) {
      applyCompanyStatusFilter(companyFilterButton.dataset.companyFilter || "");
      return;
    }

    const emailOpen = event.target.closest("[data-email-open]");
    if (emailOpen) {
      selectedEmailId = emailOpen.dataset.emailOpen;
      renderEmails();
      renderEmailDetail();
      return;
    }

    const promptTab = event.target.closest("[data-prompt-tab]");
    if (promptTab) {
      collectPrompts();
      selectedPromptKey = promptTab.dataset.promptTab;
      renderPrompts();
      return;
    }

    if (event.target.closest("#saveCompanyBtn")) {
      saveSelectedCompany();
      return;
    }
    if (event.target.closest("#markRepliedBtn")) {
      markSelectedCompanyReplied();
      return;
    }
    if (event.target.closest("#recontactDateBtn")) {
      markSelectedCompanyRecontactAtDate();
      return;
    }
    if (event.target.closest("#schedule40Btn")) {
      runAction("schedule_followup", {
        company_id: selectedCompanyId,
        days: 40,
        note: "Relance décalée depuis le site.",
      });
      return;
    }
    if (event.target.closest("#generateFormMessageBtn")) {
      runAction("generate_form_message", {
        company_id: selectedCompanyId,
      });
      return;
    }
    if (event.target.closest("#regenerateFormMessageBtn")) {
      if (!confirm("Régénérer ce texte formulaire ? L'ancien message sera archivé en ignoré.")) return;
      runAction("regenerate_form_message", {
        company_id: selectedCompanyId,
      });
      return;
    }
    if (event.target.closest("#regenerateCompanyEmailBtn")) {
      if (!confirm("Régénérer cet email ? L'ancien message non envoyé sera archivé en ignoré.")) return;
      runAction("regenerate_email", {
        company_id: selectedCompanyId,
      });
      return;
    }
    if (event.target.closest("#openCompanyMessageBtn")) {
      openLatestCompanyMessage(selectedCompanyId);
      return;
    }
    if (event.target.closest("#markFormSentBtn")) {
      if (!confirm("Marquer ce formulaire comme envoyé ?")) return;
      runAction("mark_form_sent", {
        company_id: selectedCompanyId,
        note: "Formulaire envoyé depuis le site.",
      });
      return;
    }
    if (event.target.closest("#sendCompanyEmailBtn")) {
      sendGeneratedEmailForCompany(selectedCompanyId);
      return;
    }
    if (event.target.closest("#markBadEmailBtn")) {
      markBadEmailForCompany(selectedCompanyId);
      return;
    }
    if (event.target.closest("#saveEmailBtn")) {
      saveSelectedEmail();
      return;
    }
    if (event.target.closest("#copyEmailBodyBtn")) {
      copyText($("emailBodyInput")?.value || "");
      return;
    }
    if (event.target.closest("#markEmailSentBtn")) {
      if (!confirm("Marquer ce message comme envoyé ?")) return;
      runAction("mark_email_sent", { email_id: selectedEmailId });
      return;
    }
    if (event.target.closest("#regenerateSelectedEmailBtn")) {
      regenerateSelectedEmail();
      return;
    }
    if (event.target.closest("#sendEmailBtn")) {
      if (
        !confirm(
          "Envoyer réellement cet email via Gmail maintenant ? Le contenu affiché ici sera sauvegardé puis envoyé, sans créer de brouillon Gmail intermédiaire.",
        )
      ) {
        return;
      }
      sendSelectedEmail();
    }
    if (event.target.closest("#markBadEmailFromEmailBtn")) {
      markBadEmailForSelectedEmail();
      return;
    }
  });

  document.addEventListener("change", (event) => {
    const replyStatusSelect = event.target.closest("[data-company-reply-status]");
    if (replyStatusSelect) {
      selectedCompanyId = replyStatusSelect.dataset.companyReplyStatus;
      runAction("mark_replied", {
        company_id: selectedCompanyId,
        reply_status: replyStatusSelect.value,
        note: `Résultat de réponse mis à jour depuis la liste: ${replyStatusLabel(replyStatusSelect.value) || "à analyser"}.`,
      });
      return;
    }

    const statusSelect = event.target.closest("[data-company-status]");
    if (!statusSelect) return;
    selectedCompanyId = statusSelect.dataset.companyStatus;
    runAction("set_status", {
      company_id: selectedCompanyId,
      status: statusSelect.value,
    });
  });
}

function bindNavHighlight() {
  const links = Array.from(document.querySelectorAll(".nav a"));
  // Highlight basé sur l'URL courante (pas d'ancres sur ces pages)
  const currentPath = window.location.pathname.split("/").pop() || "dashboard.html";
  links.forEach((link) => {
    const href = link.getAttribute("href") || "";
    const linkPage = href.split("/").pop() || "";
    link.classList.toggle("active", linkPage === currentPath || (currentPath === "" && linkPage === "dashboard.html"));
  });
}

async function saveSerpApiKeyFromForm() {
  const focusedInput = document.activeElement?.matches("#serpApiSetupKeyInput")
    ? $("serpApiSetupKeyInput")
    : null;
  const input =
    focusedInput ||
    ($("serpApiSetupKeyInput").value.trim() ? $("serpApiSetupKeyInput") : $("serpApiKeyInput"));
  const apiKey = input.value.trim();
  const storedKeyPresent = Boolean(state?.connections?.serpapi?.api_key_present);
  if (!apiKey && !storedKeyPresent) {
    alert("Colle ta clé API SerpApi avant de tester.");
    return;
  }
  await runAction("save_serpapi_key", apiKey ? { api_key: apiKey } : {});
  $("serpApiKeyInput").value = "";
  $("serpApiSetupKeyInput").value = "";
}

async function saveGoogleCredentialsFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".json")) {
    alert("Choisis le fichier google_credentials.json téléchargé depuis Google Cloud.");
    event.target.value = "";
    return;
  }
  const credentialsJson = await file.text();
  await runAction("save_google_credentials", { credentials_json: credentialsJson });
  event.target.value = "";
}

async function clearGoogleCredentials() {
  if (
    !confirm(
      "Supprimer l'OAuth Google actuel et les tokens locaux ? Tu devras réimporter le bon google_credentials.json.",
    )
  ) {
    return;
  }
  await runAction("clear_google_credentials");
}

function googleStatusDetail(google) {
  const parts = [google.message || ""];
  if (google.project_id) parts.push(`Projet: ${google.project_id}`);
  if (google.client_id) parts.push(`Client ID: ${google.client_id}`);
  return parts.filter(Boolean).join(" - ");
}

function googleOAuthMiniGuide() {
  return `Connexion Google pour EasyFind
1. Ouvre https://console.cloud.google.com/
2. Crée un projet Google Cloud ou choisis un projet existant.
3. Active Gmail API et Google Sheets API.
4. Va dans Google Auth Platform > Audience.
5. Si l'appli est en mode Test, ajoute ton adresse Gmail dans Test users.
6. Va dans Google Auth Platform > Clients.
7. Crée un ID client OAuth de type "Application de bureau".
8. Télécharge le fichier JSON.
9. Reviens dans EasyFind.
10. Importe ce fichier dans "Importer google_credentials.json".
11. Clique sur "Connecter Google" et autorise ton compte Gmail.

Erreur 403 access_denied = l'adresse Gmail utilisée n'est pas dans les test users du projet Google Cloud.`;
}

function serpApiDetail(serpapi) {
  if (!serpapi.message) return "";
  const parts = [serpapi.message];
  if (serpapi.account_email) parts.push(serpapi.account_email);
  if (serpapi.masked_key) parts.push(serpapi.masked_key);
  return parts.join(" - ");
}

function serpApiMiniGuide() {
  return `Connexion SerpApi pour EasyFind
1. Ouvre https://serpapi.com/manage-api-key
2. Connecte-toi ou crée un compte avec Google/GitHub.
3. Copie la clé API affichée sur la page.
4. Reviens dans EasyFind.
5. Colle la clé dans le champ SerpApi.
6. Clique sur "Tester et enregistrer".`;
}

async function switchSession() {
  selectedCompanyId = "";
  selectedEmailId = "";
  const settingsPanel = $("settings");
  if (settingsPanel) settingsPanel.dataset.loaded = "";
  const useCaseField = $("prompt-use_case");
  if (useCaseField) useCaseField.dataset.userChanged = "";
  promptState = null;
  const select = $("sessionSelect");
  if (!select || !select.value) return;
  await runAction("switch_session", { session_id: select.value });
  await Promise.all([
    fetchState({ force: true }),
    fetchParameters(),
    fetchPrompts(),
  ]);
  restoreSessionChatForActiveSession({ force: true });
}

async function createSessionFromForm() {
  const name = $("newSessionName").value.trim();
  if (!name) {
    alert("Donne un nom à la session.");
    return;
  }
  selectedCompanyId = "";
  selectedEmailId = "";
  $("settings").dataset.loaded = "";
  $("prompt-use_case").dataset.userChanged = "";
  promptState = null;
  await runAction("create_session", {
    name,
    kind: $("newSessionKind").value,
  });
  $("newSessionName").value = "";
  await Promise.all([fetchParameters(), fetchPrompts()]);
  restoreSessionChatForActiveSession({ force: true });
}

async function toggleSessionAutopilot(button) {
  const sessionId = button.dataset.sessionToggle;
  const enabled = button.dataset.sessionEnabled === "true";
  await runAction("set_session_autopilot", {
    session_id: sessionId,
    enabled: !enabled,
  });
}

async function deleteSessionFromButton(button) {
  const sessionId = button.dataset.sessionDelete;
  const sessionName = button.dataset.sessionName || "";
  const confirmationName = prompt(
    `Pour supprimer la session "${sessionName}", retape exactement son nom :`,
  );
  if (confirmationName === null) return;
  if (confirmationName.trim() !== sessionName) {
    alert("Nom incorrect. Suppression annulée.");
    return;
  }
  if (
    !confirm(
      `Confirmer la suppression de "${sessionName}" ? La session disparaîtra du site, mais ses fichiers seront archivés localement.`,
    )
  ) {
    return;
  }
  selectedCompanyId = "";
  selectedEmailId = "";
  $("settings").dataset.loaded = "";
  promptState = null;
  clearStoredSessionChat(sessionId);
  await runAction("delete_session", {
    session_id: sessionId,
    confirmation_name: confirmationName.trim(),
  });
  await fetchParameters();
  await fetchPrompts();
}

function applyCompanyStatusFilter(status) {
  clearSelectedCompany();
  resetCompanyVisibleLimit();
  $("companyStatusFilter").value = status;
  renderCompanies();
  document.querySelector("#companies .table-wrap").scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function resetCompanyVisibleLimit() {
  companiesVisibleLimit = COMPANIES_PAGE_SIZE;
}

function showMoreCompanies() {
  companiesVisibleLimit += COMPANIES_PAGE_SIZE;
  renderCompanies();
}

function resetEmailVisibleLimit() {
  emailsVisibleLimit = EMAILS_PAGE_SIZE;
}

function showMoreEmails() {
  emailsVisibleLimit += EMAILS_PAGE_SIZE;
  renderEmails();
}

function clearSelectedCompany() {
  if (!selectedCompanyId) return;
  selectedCompanyId = "";
  renderCompanyDetail();
}

function saveSelectedCompany() {
  runAction("update_company", {
    company_id: selectedCompanyId,
    status: $("companyStatusInput").value,
    detected_email: $("companyEmailInput").value.trim(),
    website_url: $("companyWebsiteInput").value.trim(),
    contact_page_url: $("companyContactInput").value.trim(),
    next_followup_at: dateToIso($("companyFollowupInput").value),
    notes: $("companyNotesInput").value.trim(),
  });
}

function markSelectedCompanyReplied() {
  const note = $("companyReplyNoteInput").value.trim();
  runAction("mark_replied", {
    company_id: selectedCompanyId,
    reply_status: $("companyReplyStatusInput").value || "",
    note,
  });
}

function markSelectedCompanyRecontactAtDate() {
  const date = $("companyFollowupInput").value;
  if (!date) {
    alert("Choisis d'abord une date dans Recontact / relance.");
    return;
  }
  const note = $("companyReplyNoteInput").value.trim();
  runAction("mark_replied", {
    company_id: selectedCompanyId,
    reply_status: $("companyReplyStatusInput").value || "recontact_after_date",
    note: note || `Recontacter à partir du ${date}.`,
    next_followup_at: dateToIso(date),
  });
}

function saveSelectedEmail() {
  runAction("update_email", selectedEmailPayload());
}

function sendSelectedEmail() {
  runAction("send_email", selectedEmailPayload());
}

function regenerateSelectedEmail() {
  const email = findEmail(selectedEmailId);
  if (!email || !canRegenerateEmailMessage(email)) return;
  const isFormMessage = isFormRecipient(email.email_to);
  const confirmation = isFormMessage
    ? "Régénérer ce texte formulaire ? L'ancien message sera archivé en ignoré."
    : "Régénérer cet email ? L'ancien message non envoyé sera archivé en ignoré.";
  if (!confirm(confirmation)) return;
  selectedCompanyId = email.company_id || selectedCompanyId;
  runAction(isFormMessage ? "regenerate_form_message" : "regenerate_email", {
    company_id: selectedCompanyId,
  });
}

function markBadEmailForCompany(companyId) {
  const company = findCompany(companyId);
  if (!company) return;
  const badEmail = company.detected_email || company.latest_email_to || "";
  if (!badEmail || isFormRecipient(badEmail)) {
    alert("Aucune adresse email à signaler comme mauvaise sur cette fiche.");
    return;
  }
  if (
    !confirm(
      `Marquer ${badEmail} comme mauvaise adresse ? L'adresse sera supprimée, le message passera en échec et l'entreprise reviendra en À candidater.`,
    )
  ) {
    return;
  }
  runAction("mark_bad_email", {
    company_id: companyId,
    note: "Adresse email invalide signalée depuis le site.",
  });
}

function markBadEmailForSelectedEmail() {
  const email = findEmail(selectedEmailId);
  if (!email) return;
  if (!canMarkBadEmail(email)) {
    alert("Ce message ne contient pas d'adresse email à signaler comme mauvaise.");
    return;
  }
  if (
    !confirm(
      `Marquer ${email.email_to} comme mauvaise adresse ? L'adresse sera supprimée de l'entreprise et ce message passera en échec.`,
    )
  ) {
    return;
  }
  runAction("mark_bad_email", {
    email_id: selectedEmailId,
    note: "Adresse email invalide signalée depuis le détail email.",
  });
}

function openLatestCompanyMessage(companyId) {
  const company = findCompany(companyId);
  if (!company?.latest_email_id) {
    alert("Aucun message prêt pour cette entreprise.");
    return;
  }
  selectedCompanyId = companyId;
  selectedEmailId = company.latest_email_id;
  renderCompanies();
  renderCompanyDetail();
  const block = document.querySelector(".detail-email-block");
  if (block) block.scrollIntoView({ behavior: "smooth", block: "start" });
}

function sendGeneratedEmailForCompany(companyId) {
  const company = findCompany(companyId);
  if (!company) return;
  const emailId = sendableCompanyEmailId(company);
  if (!emailId) {
    alert("Aucun email généré prêt à envoyer pour cette entreprise.");
    return;
  }
  if (
    !confirm(
      `Envoyer réellement l'email généré à ${company.latest_email_to || company.company_name} via Gmail maintenant ?`,
    )
  ) {
    return;
  }
  selectedCompanyId = companyId;
  runAction("send_email", { email_id: emailId });
}

function selectedEmailPayload() {
  const email = findEmail(selectedEmailId) || {};
  return {
    email_id: selectedEmailId,
    email_to: ($("emailToInput")?.value ?? email.email_to ?? "").trim(),
    subject: ($("emailSubjectInput")?.value ?? email.subject ?? "").trim(),
    body: $("emailBodyInput")?.value ?? email.body ?? "",
    personalization_notes: ($("emailNotesInput")?.value ?? email.personalization_notes ?? "").trim(),
    status: $("emailStatusInput")?.value ?? email.status ?? "",
    reply_status: $("emailReplyStatusInput")?.value ?? email.reply_status ?? "",
  };
}

bindEvents();
renderSettingsPanelCollapse();
renderPromptsPanelCollapse();
renderEmailsPanelCollapse();
renderSessionChatMessages();
renderSessionChatProgress(0, "local");
renderSessionChatWaiting();
fetchState();
fetchParameters();
fetchPrompts();
setInterval(fetchState, 4000);
