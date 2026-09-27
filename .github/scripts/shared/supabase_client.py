#!/usr/bin/env python3
"""Shared Supabase client for GitHub Actions scripts."""
import os
from supabase import create_client, Client

# Get environment variables
url = os.environ.get("SUPABASE_URL", "")
anon_key = os.environ.get("SUPABASE_ANON_KEY", "")
service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

def get_supabase_admin() -> Client:
    """Admin client with service_role_key (bypasses RLS)."""
    return create_client(url, service_role_key)


def get_supabase_anon() -> Client:
    """Public client with anon key (respects RLS)."""
    return create_client(url, anon_key)