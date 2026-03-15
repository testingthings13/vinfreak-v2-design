"""Shared constants for the VINFREAK backend."""


DEFAULT_FREAKSTATS_SYSTEM_PROMPT = (
    "You are FREAKStats, an automotive analyst who blends enthusiast excitement "
    "with data-backed insight. Provide vivid, trustworthy guidance for potential buyers."
)

DEFAULT_FREAKSTATS_USER_PROMPT = """Tell me everything you can about this car: {url}

Your insights will be put on a website that gives more information to potential buyers of the car.

The car is: {vehicle_line}

Format the remainder of your response using the following sections, styled in bold Markdown headers:

**FREAKStats**  
Start with a vivid paragraph overview of the car. For example:  
"{example_sentence}"

**FREAKNotes**  
- Bullet point notes specific to this car’s condition, dealership reputation, CARFAX/accident/title status, service history, or other unique notes.

**FREAKScore (0–100)**  
- Rate this car on these categories with bullet points: Performance, Design, Technology, Exclusivity, Value.  
- End with a final bullet point summarizing the car’s overall appeal.  
- Make it a fun "COOLNESS TYPE SCORE."

**FREAKSpec**  
- List bullet points of unique specs and features that make this particular car stand out.  
- If dealer extras or add-ons are present, include the estimated MSRP for each.

**Detailed Description**  
- Provide many bullet points covering all angles: overview, performance, exterior, dimensions, interior features, safety, tech, etc.  
- Think of this as a full informational dump for buyers.

**FREAK:TLDR**  
Wrap up with 5–6 sentences giving a concise summary of what this car is all about.  
Keep it punchy, clear, and to the point so even a skim-reader gets the whole picture.

Do not end with any follow-up questions like "let me know if you’d like more." This should be a complete information dump.
"""

# Backwards compatibility alias (legacy code may still import DEFAULT_FREAKSTATS_PROMPT)
DEFAULT_FREAKSTATS_PROMPT = DEFAULT_FREAKSTATS_SYSTEM_PROMPT

# Variant-specific defaults. Today they mirror the shared defaults but they live as
# dedicated constants so each experience can diverge without further code changes.
DEFAULT_FREAKSTATS_SYSTEM_PROMPT_RETAIL = DEFAULT_FREAKSTATS_SYSTEM_PROMPT
DEFAULT_FREAKSTATS_USER_PROMPT_RETAIL = DEFAULT_FREAKSTATS_USER_PROMPT
DEFAULT_FREAKSTATS_SYSTEM_PROMPT_AUCTION = DEFAULT_FREAKSTATS_SYSTEM_PROMPT
DEFAULT_FREAKSTATS_USER_PROMPT_AUCTION = DEFAULT_FREAKSTATS_USER_PROMPT

# Status defaults for prompt variants. The auction experience defaults to
# triggering when listings are marked as in-progress auctions while the
# non-auction experience applies to all other statuses.
DEFAULT_FREAKSTATS_RETAIL_STATUSES: tuple[str, ...] = ()
DEFAULT_FREAKSTATS_AUCTION_STATUSES: tuple[str, ...] = ("AUCTION_IN_PROGRESS",)
