import secrets
import string


ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
SIZE = 12


def nanoid() -> str:
    # Mirrors the JS nanoid implementation using a fixed alphabet and length.
    return "".join(secrets.choice(ALPHABET) for _ in range(SIZE))

