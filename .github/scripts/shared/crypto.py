#!/usr/bin/env python3
"""Fernet encryption/decryption for GitHub Actions scripts."""
import os
from cryptography.fernet import Fernet

# Get encryption key from environment
ENCRYPTION_KEY = os.environ["ENCRYPTION_KEY"]
fernet = Fernet(ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY)

def encrypt(value: str) -> bytes:
    """Encrypt a string value."""
    return fernet.encrypt(value.encode())

def decrypt(encrypted: bytes) -> str:
    """Decrypt an encrypted value."""
    return fernet.decrypt(encrypted).decode()

def encrypt_str(value: str) -> str:
    """Encrypt and return as base64 string."""
    return fernet.encrypt(value.encode()).decode()

def decrypt_str(encrypted_str: str) -> str:
    """Decrypt from base64 string."""
    return fernet.decrypt(encrypted_str.encode()).decode()