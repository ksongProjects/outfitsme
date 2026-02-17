from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class SettingsEncryptionError(RuntimeError):
    pass


def _get_cipher() -> Fernet:
    key = settings.SETTINGS_ENCRYPTION_KEY
    if not key:
        raise SettingsEncryptionError("SETTINGS_ENCRYPTION_KEY is required to store model API keys.")
    try:
        return Fernet(key.encode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise SettingsEncryptionError("SETTINGS_ENCRYPTION_KEY is invalid for Fernet.") from exc


def encrypt_secret(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    cipher = _get_cipher()
    return cipher.encrypt(raw.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str) -> str:
    token = (value or "").strip()
    if not token:
        return ""
    cipher = _get_cipher()
    try:
        return cipher.decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise SettingsEncryptionError("Stored secret could not be decrypted with SETTINGS_ENCRYPTION_KEY.") from exc


def mask_secret(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    if len(raw) <= 8:
        return "*" * len(raw)
    return f"{raw[:4]}...{raw[-4:]}"
