#!/usr/bin/env python3
"""Gmail API wrapper for GitHub Actions scripts - uses Supabase REST client."""
import os
import base64
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import httpx

from scripts.shared.crypto import decrypt_str
from scripts.shared.supabase_client import get_supabase_admin


async def get_user_gmail_token(supabase, user_id: str) -> str:
    """Get decrypted Gmail access token for a user."""
    token_res = supabase.select(
        "oauth_tokens", 
        filters={"user_id": user_id, "provider": "google"}, 
        single=True
    )
    
    if not token_res:
        raise Exception("Google not connected for user")
    
    return decrypt_str(token_res["access_token_enc"])


async def send_gmail(
    supabase,
    user_id: str,
    company_id: str,
    subject: str,
    body_text: str,
    body_html: str = None,
    to_email: str = None
) -> dict:
    """Send email via Gmail API using user's OAuth token."""
    
    # Get access token
    access_token = await get_user_gmail_token(supabase, user_id)
    
    # Get company for context
    company_res = supabase.select(
        "companies", 
        filters={"id": company_id, "user_id": user_id}, 
        single=True
    )
    if not company_res:
        raise Exception("Company not found")
    
    company = company_res
    to = to_email or company.get("detected_email")
    if not to:
        raise Exception("No recipient email")
    
    # Create email message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = "me"
    msg["To"] = to
    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    if body_html:
        msg.attach(MIMEText(body_html, "html", "utf-8"))
    
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    
    # Send via Gmail API
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={"raw": raw},
            timeout=30
        )
        
        if resp.status_code == 401:
            raise Exception("Google token expired, user needs to reconnect")
        
        resp.raise_for_status()
        gmail_data = resp.json()
    
    # Save email record
    email_data = {
        "user_id": user_id,
        "company_id": company_id,
        "session_id": company.get("session_id"),
        "direction": "outbound",
        "gmail_message_id": gmail_data.get("id"),
        "gmail_thread_id": gmail_data.get("threadId"),
        "subject": subject,
        "body_text": body_text,
        "body_html": body_html,
        "from_email": "me",
        "to_emails": [to],
        "status": "sent",
        "sent_at": datetime.utcnow().isoformat()
    }
    
    email_res = supabase.insert("emails", email_data)
    
    # Update company
    supabase.update("companies", {
        "status": "sent",
        "latest_email_id": email_res[0]["id"] if email_res else None,
        "latest_email_status": "sent",
        "latest_email_sent_at": datetime.utcnow().isoformat(),
        "contacted_at": datetime.utcnow().isoformat()
    }, filters={"id": company_id})
    
    return {"ok": True, "gmail_id": gmail_data.get("id"), "email_id": email_res[0]["id"] if email_res else None}