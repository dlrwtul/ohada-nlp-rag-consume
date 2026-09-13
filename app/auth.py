"""Authentification : mots de passe (bcrypt) + identité de session (compte ou invité).

Pas de mur de connexion : `get_or_create_user_id` ne renvoie jamais 401, elle
provisionne silencieusement un utilisateur invité si la session n'en a pas
encore. La limite « un invité = une seule conversation » est appliquée par
les routes elles-mêmes (app/main.py), pas ici.
"""
import secrets

import bcrypt
from fastapi import Request

from app import db

GUEST_USERNAME_PREFIX = "guest_"

# bcrypt tronque silencieusement au-delà de 72 octets : on le fait nous-mêmes
# explicitement pour que le comportement soit documenté plutôt que subi.
_MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    truncated = password.encode("utf-8")[:_MAX_PASSWORD_BYTES]
    return bcrypt.hashpw(truncated, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    truncated = password.encode("utf-8")[:_MAX_PASSWORD_BYTES]
    return bcrypt.checkpw(truncated, password_hash.encode("utf-8"))


def create_guest_user() -> int:
    username = GUEST_USERNAME_PREFIX + secrets.token_hex(8)
    return db.create_user(username, password_hash=None, is_guest=True)


def get_or_create_user_id(request: Request) -> int:
    user_id = request.session.get("user_id")
    if user_id is not None and db.get_user_by_id(user_id) is not None:
        return user_id

    new_id = create_guest_user()
    request.session["user_id"] = new_id
    return new_id


def is_guest(user_id: int) -> bool:
    user = db.get_user_by_id(user_id)
    return bool(user and user["is_guest"])


def login_session(request: Request, user_id: int) -> None:
    """Connecte la session sur `user_id`, en rattachant l'éventuelle
    conversation invité en cours à ce compte réel avant de basculer."""
    previous_id = request.session.get("user_id")
    if previous_id is not None and previous_id != user_id:
        previous_user = db.get_user_by_id(previous_id)
        if previous_user is not None and previous_user["is_guest"]:
            db.reassign_conversations(previous_id, user_id)
            db.delete_user(previous_id)

    request.session["user_id"] = user_id


def logout_session(request: Request) -> None:
    request.session.clear()
