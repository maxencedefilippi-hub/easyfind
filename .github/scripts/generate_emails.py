#!/usr/bin/env python3
"""Generate emails for queued job_log entries (action=generate_email).

For each pending job_log with action=generate_email:
1. Fetch company data
2. Generate email content using OpenAI (or template fallback)
3. Insert into emails table
4. Update company latest_email_*
5. Mark job_log as processed (details.queued=false)
"""
import os
import sys
import json
import httpx
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.shared.supabase_client import get_supabase_admin

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")


def fetch_openai(prompt: str, system: str) -> str:
    """Call OpenAI to generate email content. Falls back to template if no key."""
    if not OPENAI_API_KEY:
        return ""
    resp = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
        json={
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
            "max_tokens": 600,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def build_template_email(company: dict, settings: dict) -> tuple:
    """Fallback: build email from settings template (no AI)."""
    full_name = settings.get("user_full_name", "")
    signature = settings.get("email_signature_name", full_name)
    phone = settings.get("user_phone", "")
    portfolio = settings.get("portfolio_url", "")
    linkedin = settings.get("linkedin_url", "")
    profile = settings.get("user_profile_summary", "")
    objective = settings.get("email_objective", "")

    subject = f"Contact - {profile[:60]}" if profile else f"Contact professionnel - {company.get('company_name', '')}"

    body = f"""Bonjour,

Je me permets de vous contacter au sujet de {company.get('company_name', 'votre entreprise')}.

{profile}

{objective}

Merci de me dire si un échange pourrait être pertinent.

Bien cordialement,
{signature}
""" + (f"Tél: {phone}\n" if phone else "") + (f"Portfolio: {portfolio}\n" if portfolio else "") + (f"LinkedIn: {linkedin}" if linkedin else "")

    return subject, body


def main():
    supabase = get_supabase_admin()

    # Get all generate_email jobs
    jobs = supabase.select("job_log", filters={"action": "generate_email"})

    if not jobs:
        print("No generate_email jobs found")
        return

    # Filter: only jobs where details.queued == true
    pending = [j for j in jobs if (j.get("details") or {}).get("queued") is True]
    print(f"Found {len(pending)} pending generate_email jobs")

    generated = 0
    for job in pending:
        company_id = job.get("company_id")
        user_id = job.get("user_id")
        if not company_id or not user_id:
            print(f"Skipping job {job['id']}: missing company_id/user_id")
            continue

        # Fetch company
        company = supabase.select("companies", filters={"id": company_id}, single=True)
        if not company:
            print(f"Company {company_id} not found, skipping")
            continue

        # Fetch user settings
        settings = supabase.select("settings", filters={"user_id": user_id}, single=True) or {}

        session_id = company.get("session_id")

        # Try AI generation, fallback to template
        subject = ""
        body = ""
        profile = settings.get("user_profile_summary", "")
        tone = settings.get("email_tone", "direct, humain, concret")
        target = company.get("company_name", "l'entreprise")

        if OPENAI_API_KEY:
            try:
                system = f"Tu es un assistant qui rédige des emails de prospection en français. Ton: {tone}. L'email doit être court (max 150 mots), direct, sans flatterie, avec un appel à l'action clair. Réponds UNIQUEMENT avec un JSON valide: {{\"subject\": \"...\", \"body\": \"...\"}}"
                prompt = f"""Rédige un email de contact pour l'entreprise "{target}".
Profil de l'expéditeur: {profile}
Objectif: {settings.get('email_objective', 'obtenir un échange')}
Signature: {settings.get('email_signature_name', '')}
Email de l'entreprise: {company.get('detected_email', '')}"""
                result = fetch_openai(prompt, system)
                try:
                    # Strip markdown code fences if present
                    clean = result.strip()
                    if clean.startswith("```"):
                        clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
                    parsed = json.loads(clean)
                    subject = parsed.get("subject", "")
                    body = parsed.get("body", "")
                except Exception:
                    # Not JSON, use as body
                    body = result
                    subject = f"Contact - {profile[:50]}"
            except Exception as e:
                print(f"OpenAI failed for {company_id}: {e}, using template")

        if not subject or not body:
            subject, body = build_template_email(company, settings)

        # Insert email
        email_payload = {
            "user_id": user_id,
            "company_id": company_id,
            "session_id": session_id,
            "direction": "outbound",
            "subject": subject,
            "body_text": body,
            "from_email": settings.get("user_email", ""),
            "to_emails": [company.get("detected_email", "")],
            "status": "draft",
            "generated_by_ai": bool(OPENAI_API_KEY),
        }

        inserted = supabase.insert("emails", [email_payload])
        if inserted:
            email_id = inserted[0]["id"] if isinstance(inserted, list) else inserted.get("id")
            # Update company latest_email_*
            supabase.update("companies", {
                "latest_email_id": email_id,
                "latest_email_status": "draft",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }, filters={"id": company_id})

            # Mark job as done: remove queued flag
            supabase.update("job_log", {
                "details": {"queued": False, "message": f"Email généré: {email_id}", "email_id": email_id},
            }, filters={"id": job["id"]})

            generated += 1
            print(f"Generated email for company {company_id}: {email_id}")
        else:
            print(f"Failed to insert email for company {company_id}")

    print(f"Total emails generated: {generated}")


if __name__ == "__main__":
    main()