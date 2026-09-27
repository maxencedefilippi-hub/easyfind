#!/usr/bin/env python3
"""Shared Supabase client for GitHub Actions scripts."""
import os
from supabase import create_client, Client


def _get_env(key: str, default: str = "") -> str:
    """Get environment variable with fallback."""
    return os.environ.get(key, default)


url = _get_env("SUPABASE_URL")
anon_key = _get_env("SUPABASE_ANON_KEY")
service_role_key = _get_env("SUPABASE_SERVICE_ROLE_KEY")


def _build_client_kwargs() -> dict:
    """Build kwargs for create_client, avoiding unsupported arguments."""
    kwargs = {}
    if url:
        kwargs["supabase_url"] = url
    if anon_key:
        kwargs["supabase_key"] = anon_key
    return kwargs


def get_supabase_admin() -> Client:
    """Admin client with service_role_key (bypasses RLS)."""
    return create_client(supabase_url, service_role_key)


def get_supabase_anon() -> Client:
    """Public client with anon key (respects RLS)."""
    return create_client(supabase_url, anon_key)