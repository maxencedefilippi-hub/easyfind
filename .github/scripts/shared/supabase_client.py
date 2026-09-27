#!/usr/bin/env python3
"""Simple Supabase REST client for GitHub Actions - bypasses Python client issues."""
import os
import httpx
from typing import Optional, Dict, Any, List


class SupabaseRestClient:
    """Minimal Supabase REST API client using httpx directly."""
    
    def __init__(self, url: str, key: str):
        self.base_url = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        self.client = httpx.AsyncClient(timeout=30.0, headers=self.headers)
    
    async def close(self):
        await self.client.aclose()
    
    # --- QUERY BUILDERS ---
    
    def _build_url(self, table: str, filters: Optional[Dict] = None, 
                   select: str = "*", order: Optional[str] = None, 
                   limit: Optional[int] = None, offset: Optional[int] = None) -> str:
        url = f"{self.base_url}/{table}?select={select}"
        
        if filters:
            for k, v in filters.items():
                if isinstance(v, dict):
                    for op, val in v.items():
                        url += f"&{k}={op}.{val}"
                else:
                    url += f"&{k}=eq.{v}"
        
        if order:
            url += f"&order={order}"
        if limit:
            url += f"&limit={limit}"
        if offset:
            url += f"&offset={offset}"
        
        return url
    
    # --- CRUD OPERATIONS ---
    
    async def select(self, table: str, filters: Optional[Dict] = None,
                     select: str = "*", order: Optional[str] = None,
                     limit: Optional[int] = None, offset: Optional[int] = None,
                     single: bool = False) -> Any:
        """SELECT query."""
        url = self._build_url(table, filters, select, order, limit, offset)
        if single:
            url += "&limit=1"
        
        resp = await self.client.get(url)
        resp.raise_for_status()
        data = resp.json()
        
        if single:
            return data[0] if data else None
        return data
    
    async def insert(self, table: str, data: Dict | List[Dict], 
                     on_conflict: Optional[str] = None) -> List[Dict]:
        """INSERT query."""
        headers = self.headers.copy()
        if on_conflict:
            headers["Prefer"] = f"resolution=merge-duplicates,return=representation"
            url = f"{self.base_url}/{table}?on_conflict={on_conflict}"
        else:
            headers["Prefer"] = "return=representation"
            url = f"{self.base_url}/{table}"
        
        resp = await self.client.post(url, json=data, headers=headers)
        resp.raise_for_status()
        return resp.json()
    
    async def update(self, table: str, data: Dict, 
                     filters: Dict) -> List[Dict]:
        """UPDATE query."""
        url = self._build_url(table, filters)
        headers = self.headers.copy()
        headers["Prefer"] = "return=representation"
        
        resp = await self.client.patch(url, json=data, headers=headers)
        resp.raise_for_status()
        return resp.json()
    
    async def delete(self, table: str, filters: Dict) -> int:
        """DELETE query."""
        url = self._build_url(table, filters)
        resp = await self.client.delete(url)
        resp.raise_for_status()
        return resp.status_code
    
    async def rpc(self, function: str, params: Dict) -> Any:
        """Call a Postgres function."""
        url = f"{self.base_url.rsplit('/rest/v1', 1)[0]}/rest/v1/rpc/{function}"
        resp = await self.client.post(url, json=params)
        resp.raise_for_status()
        return resp.json()


# Factory functions
def get_admin_client() -> SupabaseRestClient:
    """Admin client with service_role_key (bypasses RLS)."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return SupabaseRestClient(url, key)


def get_anon_client() -> SupabaseRestClient:
    """Public client with anon key (respects RLS)."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_ANON_KEY"]
    return SupabaseRestClient(url, key)


# Sync wrapper for simple scripts
class SupabaseSyncClient:
    """Synchronous wrapper for simple scripts."""
    
    def __init__(self, url: str, key: str):
        self.base_url = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        self.client = httpx.Client(timeout=30.0, headers=self.headers)
    
    def _build_url(self, table: str, filters: Optional[Dict] = None,
                   select: str = "*", order: Optional[str] = None,
                   limit: Optional[int] = None, offset: Optional[int] = None) -> str:
        url = f"{self.base_url}/{table}?select={select}"
        if filters:
            for k, v in filters.items():
                if isinstance(v, dict):
                    for op, val in v.items():
                        url += f"&{k}={op}.{val}"
                else:
                    url += f"&{k}=eq.{v}"
        if order:
            url += f"&order={order}"
        if limit:
            url += f"&limit={limit}"
        if offset:
            url += f"&offset={offset}"
        return url
    
    def select(self, table: str, filters: Optional[Dict] = None,
               select: str = "*", order: Optional[str] = None,
               limit: Optional[int] = None, offset: Optional[int] = None,
               single: bool = False) -> Any:
        url = self._build_url(table, filters, select, order, limit, offset)
        if single:
            url += "&limit=1"
        resp = self.client.get(url)
        resp.raise_for_status()
        data = resp.json()
        if single:
            return data[0] if data else None
        return data
    
    def insert(self, table: str, data: Dict | List[Dict],
               on_conflict: Optional[str] = None) -> List[Dict]:
        headers = self.headers.copy()
        if on_conflict:
            headers["Prefer"] = "resolution=merge-duplicates,return=representation"
            url = f"{self.base_url}/{table}?on_conflict={on_conflict}"
        else:
            headers["Prefer"] = "return=representation"
            url = f"{self.base_url}/{table}"
        resp = self.client.post(url, json=data, headers=headers)
        resp.raise_for_status()
        return resp.json()
    
    def update(self, table: str, data: Dict, filters: Dict) -> List[Dict]:
        url = self._build_url(table, filters)
        headers = self.headers.copy()
        headers["Prefer"] = "return=representation"
        resp = self.client.patch(url, json=data, headers=headers)
        resp.raise_for_status()
        return resp.json()
    
    def delete(self, table: str, filters: Dict) -> int:
        url = self._build_url(table, filters)
        resp = self.client.delete(url)
        resp.raise_for_status()
        return resp.status_code
    
    def rpc(self, function: str, params: Dict) -> Any:
        url = f"{self.base_url.rsplit('/rest/v1', 1)[0]}/rest/v1/rpc/{function}"
        resp = self.client.post(url, json=params)
        resp.raise_for_status()
        return resp.json()
    
    def close(self):
        self.client.close()


def get_supabase_admin() -> SupabaseSyncClient:
    """Admin client with service_role_key (bypasses RLS)."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return SupabaseSyncClient(url, key)


def get_supabase_anon() -> SupabaseSyncClient:
    """Public client with anon key (respects RLS)."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_ANON_KEY"]
    return SupabaseSyncClient(url, key)