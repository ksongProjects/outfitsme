from __future__ import annotations

ROLE_TRIAL = "trial"
ROLE_PREMIUM = "premium"
ROLE_ADMIN = "admin"

VALID_USER_ROLES = {ROLE_TRIAL, ROLE_PREMIUM, ROLE_ADMIN}


def normalize_user_role(raw_role: str | None, *, legacy_is_premium: bool = False) -> str:
    role = str(raw_role or "").strip().lower()
    if role in VALID_USER_ROLES:
        return role
    if legacy_is_premium:
        return ROLE_PREMIUM
    return ROLE_TRIAL


def is_trial_role(role: str | None) -> bool:
    return normalize_user_role(role) == ROLE_TRIAL


def is_premium_role(role: str | None) -> bool:
    return normalize_user_role(role) == ROLE_PREMIUM


def is_admin_role(role: str | None) -> bool:
    return normalize_user_role(role) == ROLE_ADMIN


def has_unlimited_ai_access(role: str | None) -> bool:
    normalized = normalize_user_role(role)
    return normalized in {ROLE_PREMIUM, ROLE_ADMIN}


def has_accessory_access(role: str | None, *, enable_accessory_analysis: bool = False) -> bool:
    normalized = normalize_user_role(role)
    return normalized in {ROLE_PREMIUM, ROLE_ADMIN} or bool(enable_accessory_analysis)
