#!/usr/bin/env python3
"""Shared Supabase client for GitHub Actions scripts."""
import os
from supabase import create_client, Client

def get_supabase_admin() -> Client:
    """Admin client with service_role_key (bypasses RLS)."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)

def get_supabase_anon() -> Client:
    """Public client with anon key (respects RLS)."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_ANON_KEY"]
    return create_client(url, key)