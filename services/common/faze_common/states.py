"""State machines as data. The migrations create the same tables, and a test fails if they disagree.

Source: Ch. 13 lists the states but no transitions, so these tables are inferred (A-4).
"""

from __future__ import annotations

CAMPAIGN_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {
        ("draft", "scheduled"),
        ("scheduled", "accepting_entries"),
        ("accepting_entries", "shortlist_locked"),
        ("shortlist_locked", "voting"),
        ("voting", "closed"),
        ("closed", "published"),
        ("published", "archived"),
        ("scheduled", "paused"),
        ("accepting_entries", "paused"),
        ("shortlist_locked", "paused"),
        ("voting", "paused"),
        ("paused", "scheduled"),
        ("paused", "accepting_entries"),
        ("paused", "shortlist_locked"),
        ("paused", "voting"),
        # Closing is allowed from a paused ballot (FR-4.3). The database allows it only if paused from voting.
        ("paused", "closed"),
    }
)

ENTRY_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {
        ("received", "processing"),
        ("received", "in_review"),
        ("processing", "in_review"),
        ("received", "declined"),
        ("processing", "declined"),
        ("in_review", "declined"),
        ("received", "withdrawn"),
        ("processing", "withdrawn"),
        ("in_review", "withdrawn"),
        ("in_review", "finalist"),
        ("finalist", "published"),
    }
)

BALLOT_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {("open", "paused"), ("paused", "open"), ("open", "closed"), ("paused", "closed")}
)

CAMPAIGN_STATES = ("draft", "scheduled", "accepting_entries", "shortlist_locked", "voting",
                   "closed", "published", "archived", "paused")
ENTRY_STATES = ("received", "processing", "in_review", "finalist", "published", "declined", "withdrawn")
BALLOT_STATES = ("open", "paused", "closed")

# The demo "advance" control moves a campaign along this path (FR-4.5).
HAPPY_PATH: dict[str, str] = {
    "draft": "scheduled",
    "scheduled": "accepting_entries",
    "accepting_entries": "shortlist_locked",
    "shortlist_locked": "voting",
    "voting": "closed",
    "closed": "published",
    "published": "archived",
}


def can_transition(machine: frozenset[tuple[str, str]], source: str, target: str) -> bool:
    return (source, target) in machine
