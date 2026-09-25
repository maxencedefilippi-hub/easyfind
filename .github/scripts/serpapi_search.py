#!/usr/bin/env python3
"""SerpApi search job - triggered via workflow_dispatch for specific query."""
import os
import sys
import json

from .shared.supabase_client import get_supabase_admin
from .enrich import search_serpapi, get_serpapi_key

async def main():
    # Get parameters from environment
    user_id = os.environ.get("USER_ID")
    session_id = os.environ.get("SESSION_ID")
    query = os.environ.get("QUERY")
    location = os.environ.get("LOCATION", "France")
    
    if not all([user_id, session_id, query]):
        print("Missing required parameters: USER_ID, SESSION_ID, QUERY")
        sys.exit(1)
    
    supabase = get_supabase_admin()
    
    try:
        api_key = get_serpapi_key(supabase, user_id)
        companies = await search_serpapi(query, location, api_key)
        
        if not companies:
            print("No companies found")
            return
        
        # Save to session
        for c in companies:
            c["user_id"] = user_id
            c["session_id"] = session_id
        
        supabase.table("companies").upsert(companies, on_conflict="id").execute()
        
        # Increment usage if user has own key
        serpapi_res = supabase.table("serpapi_keys").select("used_this_month").eq("user_id", user_id).single().execute()
        if serpapi_res.data:
            supabase.rpc("increment_serpapi_usage").execute()
        
        print(f"Found and saved {len(companies)} companies")
        
    except Exception as e:
        print(f"Search failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())