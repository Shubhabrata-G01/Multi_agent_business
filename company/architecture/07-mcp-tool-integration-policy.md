# External Sources and MCP/API/Tool Integration Policy

## Preference order for reaching any external system

```text
1. Existing MCP connector (already authorized in this environment)
2. Official API (with proper credentials/subscription)
3. Authorized browser/web automation (for sites with no API)
4. Approved third-party integration (e.g. Zapier-style connector)
5. Human intervention
```

An agent never invents an MCP server, an API, or a subscription it does not actually
have. When a needed integration is unavailable, the agent spec (or the agent's live
output) uses this block instead of pretending the capability exists:

```text
Required Integration:
Tool:
Capability:
Why Needed:
Alternative:
Human Escalation:
```

## What is actually connected in this environment today

At the time this specification was written, the operating environment has:

- **Web research**: general web search and page fetch (for market/competitor/technical
  research — used by Product, Product Marketing, CEO/CFO strategic research, Legal
  regulatory checks).
- **Browser automation** (Chrome): for interacting with sites that have no API — reading
  competitor pricing pages, app-store listings, review sites, filling forms where
  authorized.
- **Google Workspace** (Gmail, Calendar, Drive): email, scheduling, document
  storage/retrieval — usable by any agent that needs to draft/send communications or
  read/write shared documents, subject to the Level 2 gate on customer-facing sends.
- **Notion**: search, read, create/update pages and databases — usable as a company
  documentation/knowledge-base backend where the org's actual docs live.
- **Hugging Face Hub**: model/dataset/Space discovery — usable by AI/Data agents
  researching model options.
- **Code hosting and CI/CD** (via the local git/shell environment): usable by
  Engineering/DevOps agents for repository, PR, and pipeline operations.
- **Job-board / freelance-market authenticator connectors** (Himalayas, Upwork,
  ZipRecruiter): usable by Talent Acquisition / Head of People for candidate sourcing
  once explicitly authorized per role.
- **Newswire** (MT Newswires): usable by Market Research-adjacent agents (Product
  Marketing, CEO/CFO strategic research) for company/market news.

Anything not on this list (a specific paid market-intelligence subscription, a specific
CRM, a specific ad platform, a specific accounting system, a specific design tool) is
**not yet connected**. Agents that would use it must use the `Required Integration`
block and fall back to manual research / human action until it is connected. This
policy file is the place to update once a new integration is authorized — individual
agent specs should reference it by name rather than duplicating the list.

## Source policy by function (what to prefer once web/API access exists)

### Market research (Product, Product Marketing, CEO/CFO strategic research)
- Official company/regulator/government sources first.
- Market sizing/industry reports: Statista, IBISWorld, Grand View Research, Gartner,
  Forrester, McKinsey, Deloitte, PwC, BCG, World Bank, IMF, OECD — **only** when a
  subscription/credential is actually available; otherwise cite what's publicly
  accessible and mark the estimate confidence Medium/Low accordingly.
- Search engines (Google/Bing or the connected web-search tool) for triangulation.

### Competitor research (Product Marketing, Product Manager, Sales)
- Official competitor websites, product docs, pricing pages.
- App stores, Product Hunt, G2, Capterra, Trustpilot, Reddit, YouTube, LinkedIn.
- Public filings where the competitor is a public company.

### Technology research (Engineering, AI/Data, Security)
- Official framework/cloud-provider/API documentation, GitHub, Stack Overflow,
  security advisories (CVE databases, vendor security bulletins).

### SEO / growth (Content/SEO, Performance/Lifecycle Marketing)
- Google Search Console, Google Trends, Google Analytics, Ahrefs, Semrush,
  Similarweb — subscription-gated; use the `Required Integration` block until
  connected.

## MCP/integration map by department (target state)

| Department | Target integrations |
|---|---|
| Engineering | Git hosting, CI/CD, cloud provider console, monitoring/observability, issue tracker |
| Product | Product analytics (e.g. event/funnel tooling), customer feedback tooling, CRM read access, documentation system (Notion), project tracker |
| Design | Figma, Google Stitch or an equivalent connected UI-generation tool, image generation, usability-testing platform — **use only when an authorized MCP/API connection exists**; otherwise design specs are produced as structured documents and static mockups with an explicit note that a design tool is not connected |
| Marketing/Growth | Analytics, Search Console, SEO platform, CMS, social platforms, email/marketing automation, ad platforms |
| Sales | CRM, email, calendar, lead-enrichment databases, proposal/e-signature systems |
| Finance | Accounting system, billing/payment processor, banking feeds, spreadsheet/financial model |
| HR | ATS, HRIS, payroll, employee directory, calendar |
| Operations | Project management, internal documentation, procurement, vendor management, IT/identity systems |
| Legal/Security | Contract repository, e-signature, vulnerability scanners, access/identity review tooling |

## Rules

1. Paid sources are used only when a subscription/credential is actually present in
   the environment — never simulated.
2. Every fact pulled from an external source must be recorded with source
   name/URL/title and access date (see `09-quality-and-confidence-standards.md`).
3. An agent must never claim it accessed a website or tool it did not actually call.
4. Outbound communications (email, social posts, ad campaigns) follow the target
   platform's policies and the company's Level 2 approval gate for anything
   customer/public-facing.
