import re

from app.features.devices.pop_service import generate_pop

CROCKFORD_ALPHABET = set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")
PATTERN = re.compile(r"^mfp_[0-9A-HJKMNP-TV-Z]{26}$")


def test_format():
    pop = generate_pop()
    assert pop.startswith("mfp_")
    assert len(pop) == 30
    assert PATTERN.match(pop)


def test_alphabet():
    for _ in range(50):
        pop = generate_pop()
        body = pop[4:]
        assert set(body).issubset(CROCKFORD_ALPHABET)
        # No ambiguous chars (Crockford excludes I, L, O, U).
        for bad in "ILOU":
            assert bad not in body


def test_no_collisions_in_a_thousand_runs():
    seen = {generate_pop() for _ in range(1000)}
    assert len(seen) == 1000
