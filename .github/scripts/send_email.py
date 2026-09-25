#!/usr/bin/env python3
"""Send email job - triggered via workflow_dispatch for specific company."""
import os
import json
import sys
from datetime import datetime

from scripts.shared.supabase_client import get_supabase_admin
from scripts.shared.gmail import send_gmail

async def main():
    # Get parameters from environment (passed by workflow_dispatch)
    company_id = os.environ.get("COMPANY_ID")
    user_id = os.environ.get("USER_ID")
    subject = os.environ.get("SUBJECT")
    body_text = os.environ.get("BODY_TEXT")
    body_html = os.environ.get("BODY_HTML")
    to_email = os.environ.get("TO_EMAIL")
    
    if not all([company_id, user_id, subject, body_text]):
        print("Missing required parameters: COMPANY_ID, USER_ID, SUBJECT, BODY_TEXT")
        sys.exit(1)
    
    try:
        result = await send_gmail(
            user_id=user_id,
            company_id=company_id,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            to_email=to_email
        )
        print(f"Email sent successfully: {result}")
    except Exception as e:
        print(f"Failed to send email: {e}")
        sys.exit(1)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())