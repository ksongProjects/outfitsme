from app.services.access_control import (
    ROLE_ADMIN,
    ROLE_PREMIUM,
    ROLE_TRIAL,
    has_accessory_access,
    has_unlimited_ai_access,
    normalize_user_role,
)


def test_normalize_user_role_defaults_to_trial():
    assert normalize_user_role(None) == ROLE_TRIAL
    assert normalize_user_role("") == ROLE_TRIAL
    assert normalize_user_role("unknown") == ROLE_TRIAL


def test_normalize_user_role_uses_legacy_premium_flag():
    assert normalize_user_role(None, legacy_is_premium=True) == ROLE_PREMIUM


def test_unlimited_access_roles():
    assert has_unlimited_ai_access(ROLE_PREMIUM) is True
    assert has_unlimited_ai_access(ROLE_ADMIN) is True
    assert has_unlimited_ai_access(ROLE_TRIAL) is False


def test_accessory_access_roles():
    assert has_accessory_access(ROLE_PREMIUM) is True
    assert has_accessory_access(ROLE_ADMIN) is True
    assert has_accessory_access(ROLE_TRIAL) is False
    assert has_accessory_access(ROLE_TRIAL, enable_accessory_analysis=True) is True
