"""The masked backtest must not tell the model who Org A is or what happened (design Ch. 18)."""
import re

from signal_lab_api.mirofish import A_RE, B_RE, build_pack


def test_masked_recruitment_pack_hides_the_org_and_the_outcome():
    pack = build_pack("recruitment-masked", "Which challenge would you enter?")
    for leak in ("faze", "faze5", "faze1", "211", "thousands", "warehouse", "2020", "2022", "moonpay", "g fuel", "nissan"):
        assert leak not in pack.lower(), leak
    assert "Challenge 1" in pack and "Challenge 2" in pack


def test_other_scenarios_keep_the_fan_pack():
    assert "Clip A" in build_pack("clip-vote", "")


def test_lean_counter_reads_indirect_phrasing():
    assert A_RE.search("I'd go for the five-spot one") and B_RE.search("the million-dollar challenge is a lottery")
    assert A_RE.search("Challenge one, easily") and B_RE.search("the second challenge")
    assert not re.search(A_RE, "I like the second challenge")
