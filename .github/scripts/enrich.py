#!/usr/bin/env python3
"""Daily enrichment job - searches companies via SerpApi and saves to Supabase."""
import os
import sys
import httpx
from datetime import datetime

# Add repo root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.shared.supabase_client import get_supabase_admin
from scripts.shared.crypto import decrypt_str

SERPAPI_ENGINE = "google_maps"


def get_serpapi_key(supabase, user_id: str) -> str:
    """Get user's SerpApi key (decrypted) or shared key."""
    res = supabase.select(
        "serpapi_keys", 
        filters={"user_id": user_id}, 
        single=True
    )
    
    if res:
        if res["used_this_month"] >= res["monthly_quota"]:
            raise Exception(f"Monthly SerpApi quota exceeded for user {user_id}")
        return decrypt_str(res["api_key_enc"])
    
    # Fallback to shared key
    shared_key = os.environ.get("SERPAPI_SHARED_KEY")
    if not shared_key:
        raise Exception(f"No SerpApi key configured for user {user_id}")
    return shared_key


async def search_serpapi(query: str, location: str, api_key: str) -> list:
    """Call SerpApi and return parsed company results."""
    params = {
        "engine": "google_maps",
        "q": f"{query} {location}",
        "api_key": api_key,
        "hl": "fr",
        "gl": "fr"
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.get("https://serpapi.com/search", params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    
    places = data.get("local_results", [])
    companies = []
    for place in places[:20]:
        companies.append({
            "company_name": place.get("title"),
            "website": place.get("website"),
            "address": place.get("address"),
            "city": location,
            "detected_email": None,
            "source": "serpapi",
            "source_url": place.get("place_id"),
            "search_query": query,
            "status": "new"
        })
    
    return companies


async def enrich_user_companies(supabase, user_id: str, session_id: str, settings: dict):
    """Enrich companies for a specific user/session."""
    query = settings.get("search_query")
    location = settings.get("search_location", "France")
    
    if not query:
        print(f"No search_query in settings for user {user_id}")
        return 0
    
    api_key = get_serpapi_key(supabase, user_id)
    companies = await search_serpapi(query, location, api_key)
    
    if not companies:
        print(f"No companies found for user {user_id}")
        return 0
    
    # Save companies to database
    for c in companies:
        c["user_id"] = user_id
        c["session_id"] = session_id
    
    supabase.insert("companies", companies, on_conflict="id")
    
    # Increment usage counter
    serpapi_res = supabase.select("serpapi_keys", filters={"user_id": user_id}, single=True)
    if serpapi_res:
        supabase.rpc("increment_serpapi_usage", {})
    
    print(f"Enriched {len(companies)} companies for user {user_id}, session {session_id}")
    return len(companies)


def main():
    supabase = get_supabase_admin()
    
    # Get all active users
    users = supabase.select("users")
    
    total_enriched = 0
    for user in users:
        user_id = user["id"]
        
        # Get active sessions with autopilot enabled
        sessions = supabase.select("sessions", filters={
            "user_id": user_id, 
            "status": "active", 
            "autopilot_enabled": True
        })
        
        if not sessions:
            continue
        
        # Get user settings
        settings_res = supabase.select("settings", filters={"user_id": user_id}, single=True)
        settings = settings_res or {}
        
        for session in sessions:
            try:
                # Run async enrichment
                import asyncio
                count = asyncio.run(enrich_user_companies(supabase, user_id, session["id"], settings))
                total_enriched += count
            except Exception as e:
                print(f"Error enriching for user {user_id}, session {session['id']}: {e}")
    
    print(f"Total companies enriched: {total_enriched}")


if __name__ == "__main__":
    main()