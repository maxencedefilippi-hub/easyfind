#!/usr/bin/env python3
"""SerpApi search for GitHub Actions scripts."""
import os
import httpx
from scripts.shared.supabase_client import get_supabase_admin
from scripts.shared.crypto import decrypt_str


def get_serpapi_key(supabase, user_id: str) -> str:
    """Get user's SerpApi key (decrypted) or shared key."""
    serpapi_res = supabase.table("serpapi_keys").select("api_key_enc, used_this_month, monthly_quota").eq("user_id", user_id).single().execute()
    
    if serpapi_res.data:
        if serpapi_res.data["used_this_month"] >= serpapi_res.data["monthly_quota"]:
            raise Exception(f"Monthly SerpApi quota exceeded for user {user_id}")
        return decrypt_str(serpapi_res.data["api_key_enc"])
    
    # Fallback to shared key
    shared_key = os.environ.get("SERPAPI_SHARED_KEY")
    if not shared_key:
        raise Exception(f"No SerpApi key configured for user {user_id}")
    return shared_key


async def search_companies(query: str, location: str = "France", user_id: str = None) -> list:
    """Search companies via SerpApi."""
    supabase = get_supabase_admin()
    
    # Get SerpApi key (shared or user's)
    serpapi_key = os.environ.get("SERPAPI_SHARED_KEY")
    
    if user_id:
        user_key_res = supabase.table("serpapi_keys").select("api_key_enc, used_this_month, monthly_quota").eq("user_id", user_id).single().execute()
        if user_key_res.data:
            if user_key_res.data["used_this_month"] < user_key_res.data["monthly_quota"]:
                serpapi_key = decrypt_str(user_key_res.data["api_key_enc"])
    
    if not serpapi_key:
        raise ValueError("No SerpApi key available")
    
    # Call SerpApi
    async with httpx.AsyncClient() as client:
        params = {
            "engine": "google_maps",
            "q": f"{query} {location}",
            "api_key": serpapi_key,
            "hl": "fr",
            "gl": "fr"
        }
        resp = await client.get("https://serpapi.com/search", params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    
    # Increment usage if user key
    if user_id and user_key_res.data:
        supabase.rpc("increment_serpapi_usage").execute()
    
    # Parse results
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