"""The masked backtest must not tell the model who Org A is or what happened (design Ch. 18)."""

import re

from signal_lab_api.mirofish import A_RE, B_RE, build_pack


def test_masked_recruitment_pack_hides_the_org_and_the_outcome():
    pack = build_pack("recruitment-masked", "Which challenge would you enter?")
    for leak in (
        "faze",
        "faze5",
        "faze1",
        "211",
        "thousands",
        "warehouse",
        "2020",
        "2022",
        "moonpay",
        "g fuel",
        "nissan",
    ):
        assert leak not in pack.lower(), leak
    assert "Challenge 1" in pack and "Challenge 2" in pack


def test_other_scenarios_keep_the_fan_pack():
    assert "Clip A" in build_pack("clip-vote", "")


def test_lean_counter_reads_indirect_phrasing():
    assert A_RE.search("I'd go for the five-spot one") and B_RE.search(
        "the million-dollar challenge is a lottery"
    )
    assert A_RE.search("Challenge one, easily") and B_RE.search("the second challenge")
    assert not re.search(A_RE, "I like the second challenge")


def test_custom_dossier_replaces_the_seeded_pack():
    from signal_lab_api.mirofish import build_pack

    text = build_pack("ecosystem", "Which one?", "A" * 300, "Pick one challenge.")
    assert text.startswith("A" * 300)
    assert "Pick one challenge." in text and "Which one?" in text
    assert "Maya" not in text  # the seeded FaZe fan pack is not mixed in


def test_poll_choice_parser_never_guesses_between_two_options():
    from signal_lab_api.mirofish import parse_choice

    o = ["Challenge 1", "Challenge 2"]
    assert parse_choice("CHOICE: Challenge 1\nBecause five spots.", o) == "Challenge 1"
    assert parse_choice("**CHOICE:** Challenge 2, easily", o) == "Challenge 2"
    assert parse_choice("CHOICE: both challenge 1 and challenge 2", o) is None
    assert parse_choice("I would pick Challenge 1.", o) == "Challenge 1"
    assert parse_choice("", o) is None


def test_poll_skips_organisation_style_agents_but_not_people():
    from signal_lab_api.mirofish import ORG_LIKE

    assert ORG_LIKE.search("Esports Event Organization and Community Management")
    assert ORG_LIKE.search("Energy drink sponsor brand")
    assert not ORG_LIKE.search("Esports Content Creator and Fan")
    assert not ORG_LIKE.search("Mid-size gaming streamer")


def test_custom_run_request_is_validated():
    import pytest
    from pydantic import ValidationError
    from signal_lab_api.mirofish import RunIn

    assert RunIn(scenario="ecosystem", pack_md="x" * 300, prompt="q").pack_md
    with pytest.raises(ValidationError):
        RunIn(scenario="ecosystem", pack_md="too short", prompt="q")
    with pytest.raises(ValidationError):
        RunIn(scenario="ecosystem", pack_md="x" * 50001, prompt="q")
