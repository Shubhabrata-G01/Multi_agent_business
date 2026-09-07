import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(ROOT, "company", "agents", "registry.json")
OUT_DIR = os.path.join(ROOT, ".claude", "agents")

with open(REGISTRY, encoding="utf-8") as f:
    registry = json.load(f)

# Core tools every agent gets: read/write the artifact repo, search the codebase.
CORE_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Bash"]

# Additional tools by team, grounded ONLY in architecture/07-mcp-tool-integration-policy.md's
# "connected today" list -- never inventing an integration that isn't actually available.
TEAM_TOOLS = {
    "Executive Team": ["WebSearch", "WebFetch", "mcp__claude_ai_Google_Drive", "mcp__claude_ai_Gmail"],
    "Product Team": ["WebSearch", "WebFetch", "mcp__claude_ai_Notion", "mcp__claude_ai_Google_Drive"],
    "Design / UX": ["WebSearch", "WebFetch"],
    "Engineering / Technology": ["WebSearch", "WebFetch", "mcp__ide"],
    "AI / Data": ["WebSearch", "WebFetch", "mcp__claude_ai_Hugging_Face"],
    "Growth / Marketing": ["WebSearch", "WebFetch", "mcp__claude-in-chrome", "mcp__claude_ai_Notion"],
    "Sales / Revenue": ["WebSearch", "WebFetch", "mcp__claude_ai_Gmail", "mcp__claude_ai_Google_Calendar"],
    "Customer Success": ["WebSearch", "mcp__claude_ai_Gmail"],
    "Finance": ["WebSearch", "WebFetch"],
    "Legal / Security": ["WebSearch", "WebFetch", "mcp__claude-in-chrome"],
    "People / HR": ["mcp__claude_ai_Himalayas_Remote_Job", "mcp__claude_ai_Upwork",
                     "mcp__claude_ai_ZipRecruiter", "mcp__claude_ai_Gmail", "mcp__claude_ai_Google_Calendar"],
    "Operations": ["WebSearch", "mcp__claude_ai_Notion"],
}

TEAM_COLOR = {
    "Executive Team": "red",
    "Product Team": "blue",
    "Design / UX": "purple",
    "Engineering / Technology": "cyan",
    "AI / Data": "pink",
    "Growth / Marketing": "orange",
    "Sales / Revenue": "green",
    "Customer Success": "yellow",
    "Finance": "blue",
    "Legal / Security": "red",
    "People / HR": "purple",
    "Operations": "cyan",
}

SECTION_RE = re.compile(r"^## (.+)$", re.MULTILINE)

def extract_section(text, name):
    """Return the body of a '## <name>' section, up to the next '## ' heading."""
    pattern = re.compile(r"^## " + re.escape(name) + r"\s*\n(.*?)(?=^## |\Z)", re.MULTILINE | re.DOTALL)
    m = pattern.search(text)
    return m.group(1).strip() if m else ""

def extract_identity_field(identity_block, field):
    m = re.search(re.escape(field) + r":\s*(.+)", identity_block)
    return m.group(1).strip() if m else ""

count = 0
for agent in registry:
    aid = agent["id"]
    src_path = os.path.join(ROOT, agent["file"].lstrip("/").replace("/", os.sep))
    with open(src_path, encoding="utf-8") as f:
        text = f.read()

    identity = extract_section(text, "Identity")
    mission = extract_section(text, "Mission")
    responsibilities = extract_section(text, "Responsibilities")
    workflow = extract_section(text, "Workflow")
    permissions = extract_section(text, "Permissions")

    primary_obj = extract_identity_field(identity, "Primary Objective")
    reports_to = extract_identity_field(identity, "Reports To")
    business_phases = extract_identity_field(identity, "Business Phase(s)")

    name_lower = aid.lower()
    team = agent["team"]
    tools = CORE_TOOLS + TEAM_TOOLS.get(team, [])
    color = TEAM_COLOR.get(team, "blue")

    flow_primary = ", ".join(agent["flow_primary_steps"]) or "none"
    flow_supporting = ", ".join(agent["flow_supporting_steps"]) or "none"

    desc = f"{agent['name']} ({team}). {primary_obj}"
    if len(desc) > 195:
        desc = desc[:192].rsplit(" ", 1)[0] + "..."
    desc = desc.replace("\n", " ").replace('"', "'")

    rel_src = agent["file"]  # already POSIX-style, e.g. /company/agents/executive/CEO-001.md

    body = f"""---
name: {name_lower}
description: "{desc}"
tools: {", ".join(tools)}
model: inherit
color: {color}
---

# {agent['name']} ({aid})

You are the **{agent['name']}** persistent agent in the AI-agent-operated software
company defined at `{rel_src.lstrip('/')}`. That file is your full specification —
read it whenever you need your complete Operating Modes table, Decision Logic, Critic/
Review Behavior, Handoff Protocol, Escalation Rules, Human Approval Requirements,
Definition of Done, Loop/Re-entry Conditions, or worked Example Input/Output. This
prompt gives you your Mission, Responsibilities, Workflow, and Permissions so you can
act immediately; treat the full spec file as authoritative if anything here and there
ever conflict.

Team: {team}
Reports to: {reports_to}
Business phase(s): {business_phases}
Business-flow steps you own as Primary: {flow_primary}
Business-flow steps you act as Supporting/Reviewing: {flow_supporting}
(See `/company/workflow/end-to-end-business-flow.md` and `business-flow.json` for what
every step actually is.)

Company-wide operating rules that apply to you exactly as they apply to every other
agent in this org — read them from `/company/architecture/` if you need the full text,
in particular `05-permissions-and-hitl.md` (Level 0-4 human-approval gates),
`08-four-eyes-and-critic-mode.md` (never create, review, and approve the same
consequential artifact yourself), and `09-quality-and-confidence-standards.md` (label
every claim FACT/ASSUMPTION/ESTIMATE/INFERENCE/RECOMMENDATION/DECISION, state
confidence as High/Medium/Low with a reason, never fabricate a source or a tool call
that didn't happen).

## Mission

{mission}

## Responsibilities

{responsibilities}

## Workflow

{workflow}

## Permissions

{permissions}

## How to end a turn

Before you consider a task done, check it against your Definition of Done in
`{rel_src.lstrip('/')}` — an artifact is not finished until it is stored in the
correct location under `/company/...` (see
`/company/architecture/11-artifact-repository-structure.md`), tagged with the
metadata block from `/company/architecture/04-knowledge-graph.md`, and handed off to
the specific downstream agent your Handoff Protocol names, with explicit acceptance
criteria — not merely produced.
"""

    out_path = os.path.join(OUT_DIR, f"{name_lower}.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(body)
    count += 1

print(f"Generated {count} subagent files in {OUT_DIR}")
