#!/usr/bin/env python3
"""Daily autopilot job - runs qualification pipeline for active sessions."""
import os
import sys
from datetime import datetime

# Add repo root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.shared.supabase_client import get_supabase_admin
from scripts.shared.gmail import send_gmail

async def run_user_autopilot(supabase, user_id: str, session_id: str, settings: dict):
    """Run autopilot pipeline for a single user session."""
    print(f"Running autopilot for user {user_id}, session {session_id}")
    
    # Get unqualified companies for this session
    companies = supabase.table("companies").select("*").eq("user_id", user_id).eq("session_id", session_id).eq("status", "new").execute()
    
    if not companies.data:
        print(f"No new companies to process for session {session_id}")
        return 0
    
    processed = 0
    for company in companies.data:
        try:
            # Qualification logic - placeholder, adapt to your needs
            qualification_score = calculate_qualification_score(company, settings)
            
            # Update company with qualification
            new_status = "qualified" if qualification_score >= 70 else "disqualified"
            supabase.table("companies").update({
                "status": new_status,
                "qualification_score": qualification_score,
                "qualification_notes": f"Auto-qualified at {datetime.utcnow().isoformat()}",
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", company["id"]).execute()
            
            # If qualified and auto-send enabled, send email
            if new_status == "qualified" and settings.get("autopilot_send_emails", False):
                email_template = settings.get("email_template", {})
                if email_template:
                    await send_gmail(
                        user_id=user_id,
                        company_id=company["id"],
                        subject=email_template.get("subject", "Opportunité de collaboration"),
                        body_text=email_template.get("body_text", ""),
                        body_html=email_template.get("body_html", "")
                    )
            
            processed += 1
            
        except Exception as e:
            print(f"Error processing company {company['id']}: {e}")
    
    # Update session last_run_at
    supabase.table("sessions").update({
        "last_run_at": datetime.utcnow().isoformat()
    }).eq("id", session_id).execute()
    
    print(f"Autopilot processed {processed} companies for session {session_id}")
    return processed

def calculate_qualification_score(company: dict, settings: dict) -> int:
    """Calculate qualification score based on company data and settings."""
    score = 50  # base score
    
    # Has website
    if company.get("website"):
        score += 10
    
    # Has detected email
    if company.get("detected_email"):
        score += 15
    
    # Has contact form
    if company.get("contact_form_url"):
        score += 10
    
    # In target city/location
    target_location = settings.get("search_location", "").lower()
    if target_location and target_location in (company.get("city", "").lower() + company.get("address", "").lower()):
        score += 10
    
    # Blacklist check
    blacklisted = settings.get("blacklisted_domains", [])
    domain = company.get("domain") or company.get("website", "").replace("https://", "").replace("http://", "").split("/")[0]
    if domain and domain in blacklisted:
        score = 0
    
    return min(100, max(0, score))

async def main():
    supabase = get_supabase_admin()
    
    # Get all active users
    users = supabase.table("users").select("id").eq("is_active", True).execute()
    
    total_processed = 0
    for user in users.data:
        user_id = user["id"]
        
        # Get active sessions with autopilot enabled
        sessions = supabase.table("sessions").select("*").eq("user_id", user_id).eq("status", "active").eq("autopilot_enabled", True).execute()
        
        if not sessions.data:
            continue
        
        # Get user settings
        settings_res = supabase.table("settings").select("*").eq("user_id", user_id).single().execute()
        settings = settings_res.data or {}
        
        for session in sessions.data:
            try:
                count = await run_user_autopilot(supabase, user_id, session["id"], settings)
                total_processed += count
            except Exception as e:
                print(f"Error in autopilot for user {user_id}, session {session['id']}: {e}")
    
    print(f"Total companies processed by autopilot: {total_processed}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())