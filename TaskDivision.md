# TaskDivision.md - Shoulder

**Team:** Shawki · Ashfaq
**Working model:** sequential. Only one person works at a time, on the same repo.
**Read `CLAUDE.md` first.** This file says *who* and *when*. `CLAUDE.md` says *what* and *why*.

---

## 0. The two constraints that shape everything

1. **Shawki holds the AWS account.** Anything touching Bedrock or AgentCore needs credentials.
   → **Shawki must create an IAM user for Ashfaq on Day 1**, or Ashfaq is blocked for two full days.
   This is the single highest-risk item in this file. See `## 5`.
2. **You are never online together.** So a handoff is not a conversation - it is a commit plus a
   checklist. Every block below ends with a **Definition of Done** that the next person can verify
   without asking a question. See `## 4`.

---

## 1. Who owns what

| | **Shawki** | **Ashfaq** |
|---|---|---|
| **Strengths** | AWS account + credits, backend/agents, writing, forms | Video, product polish, front-end |
| **Tiers owned** | 0, 1, 2, 3, 8 | 4, 5, 6, 7 |
| **Docs owned** | README, project description, video script, presentation deck, Devpost forms | Architecture diagram asset, demo seed polish, clean-clone QA |
| **Blog posts** | Post 1 (privacy boundary), Post 2 (fair division) | Post 3 (an agent that refuses to decide) |
| **Final phase** | All Devpost fields, script, deck, submission | Record + edit + upload the video |

**Rough balance:** Shawki about 5 tiers + all written submission material. Ashfaq about 4 tiers + the video +
one post. Deliberately even - Shawki front-loads the agent core because it needs AWS, Ashfaq
carries the half that judges actually *see* (Design and Presentation are 40% of the rubric).

---

## 2. Timeline

Deadline: **Sun 14 Sep, 5:00pm PT = Mon 15 Sep, 6:00am Dhaka.**
Target finish: **Sun 14 Sep, midnight Dhaka** - that leaves ~6 hours of buffer. Do not use it.

| Day | Who | Block | Output |
|---|---|---|---|
| **Tue 9 Sep** | Shawki | Block 1a | Tier 0 + Tier 1 - repo, license, venv, Bedrock working, one negotiation round end-to-end |
| **Wed 10 Sep** | Shawki | Block 1b | Tier 2 + Tier 3 - fairness engine, full negotiation graph, escalation cards. **→ HANDOFF** |
| **Thu 11 Sep** | Ashfaq | Block 2a | Tier 4 - privacy hook, authority hook, ledger |
| **Fri 12 Sep** | Ashfaq | Block 2b | Tier 5 + Tier 6 - memory/precedent, all four screens. **→ HANDOFF** |
| **Sat 13 Sep** | Shawki | Block 3 | Tier 8 - AgentCore deploy, live demo link, README, architecture export. **Devpost draft submitted.** |
| **Sat 13 Sep (eve)** | Ashfaq | Block 4a | Tier 7 evals, clean-clone QA, gather video assets |
| **Sun 14 Sep** | Both | Block 5 | Shawki: script, deck, description, blog posts 1–2, all forms. Ashfaq: record, edit, upload video, blog post 3 |

**Hard dates that do not move:**
- **Fri 11 Sep, 12:00pm PT (Sat 12 Sep, 2:00am Dhaka)** - AWS $50 credit request closes. *Shawki.*
- **Sat 13 Sep** - a complete Devpost draft must exist. It can be improved later; it cannot be started later.

---

## 3. The blocks in detail

### Block 1 - Shawki · Tue 9 – Wed 10 Sep

**Tier 0 - Foundation**
- [ ] `git init`, push public repo, **MIT LICENSE at root** (must appear in GitHub's About panel)
- [ ] Python 3.11 venv (py -3.11), `pyproject.toml`, `strands-agents` 1.55.x installed
- [ ] Bedrock connectivity smoke test - paste the passing output into the session log
- [ ] Repo skeleton: `agents/ tools/ hooks/ graph/ web/ evals/ seed/ docs/ fixtures/`
- [ ] `.gitignore`, `.env.example`
- [ ] **Create IAM user for Ashfaq** with `bedrock:InvokeModel` on Sonnet 5 + Haiku 4.5 in us-east-1. Send credentials out-of-band, never in the repo.

**Tier 1 - Core agents**
- [ ] `Principal` model with `tier: shareable | private` on every constraint
- [ ] Principal Agent + `A2AServer`, agent card served at `/.well-known/agent-card.json`
- [ ] Convener with `A2AAgent` clients reaching all three principals
- [ ] One propose → critique → response round end-to-end (ugly is fine)

**Tier 2 - Fairness engine**
- [ ] `CareTask` model + effort weighting
- [ ] `compute_burden`, `check_proportionality` (capacity-adjusted), `check_envy_freeness`, `fairness_report`
- [ ] Unit tests for all four - **fairness is never LLM-computed**

**Tier 3 - Negotiation graph**
- [ ] Full Strands Graph: intake → demand_model → propose → critique → evaluate → revise/settle/escalate
- [ ] Bounded rounds; exhaustion → escalate
- [ ] `EscalationCard` structured output
- [ ] Settled rota persisted to SQLite

**Definition of Done - Ashfaq must be able to verify all of these without asking:**
1. `python -m shoulder.cli` runs a full negotiation and prints it to the terminal. `make` is NOT installed on Shawki's machine, so the Makefile is a convenience only, never a requirement.
2. It produces a settled rota **and** at least one escalation card
3. **`fixtures/` contains committed JSON from real runs** - every rota, fairness report, escalation
   card and negotiation transcript the UI will need. *Ashfaq builds screens against these, so he is
   never blocked on Bedrock.* This is the most important deliverable of Block 1.
4. `pytest` passes
5. `CLAUDE.md` §15 session log updated; `## 12` boxes ticked
6. Commit message: `handoff: Block 1 complete (Tiers 0-3) -> Ashfaq`

---

### Block 2 - Ashfaq · Thu 11 – Fri 12 Sep

Start by reading `CLAUDE.md` end to end, especially **§1 Hard rules** and **§8 The demo**.
Build toward the storyboard in §8 - it defines what the screens must show.

**Tier 4 - Guardrails · DO NOT CUT THIS TIER**
- [x] Privacy hook: blocks any `tier: private` fact on outbound A2A messages. The A2A transport is live, so there is a real outbound surface to hook. See `shoulder/a2a/client.py` and the wire log it writes.
- [x] Authority-envelope hook: an out-of-envelope action becomes an escalation card, not an error
- [x] Ledger: every unattended action recorded with timestamp + justification
- [x] **A runnable script that visibly demonstrates the privacy hook catching a deliberate leak attempt.** This is the most persuasive five seconds of the video - it must be showable on screen.

**Tier 5 - Memory and precedent**
- [x] Per-principal session persistence (preferences drift)
- [x] Family session: rota history + resolved escalations
- [x] Precedent extraction from resolved escalations, applied next period **with provenance shown**
      ("Last time you decided whoever hosts doesn't also drive")

**Tier 6 - Product surface** *(the half judges actually see - 40% of the rubric)*
- [x] Private intake screen, privacy tiers visibly marked - **this is the trust moment, spend time here**
- [x] Rota + fairness bar - the hero component, animating across negotiation rounds
- [x] Escalation inbox - one decision per screen, warm empty state
- [x] Agent ledger
- [x] Light/dark, keyboard accessible, responsive

**Also**
- [x] Export the `CLAUDE.md` §9 mermaid diagram as a clean PNG/SVG into `docs/`

**Definition of Done - Shawki must be able to verify without asking:**
1. `npm run dev` renders all four screens against `fixtures/` with no AWS credentials present
2. The privacy-hook leak demo runs and visibly blocks
3. Every beat in `CLAUDE.md` §8 has a screen that can show it
4. `CLAUDE.md` §15 updated; `## 12` boxes ticked
5. Commit message: `handoff: Block 2 complete (Tiers 4-6) -> Shawki`

---

### Block 3 - Shawki · Sat 13 Sep

**Tier 8 - Deployment**
- [ ] Convener on AgentCore Runtime, weekly schedule
- [ ] AgentCore Memory wired
- [ ] AgentCore Identity - each sibling a distinct authenticated principal
- [ ] AgentCore Gateway for notifications
- [ ] OTEL traces → CloudWatch
- [ ] **Live demo link, publicly reachable** - explicitly raises the Technical Implementation score

**Submission groundwork**
- [ ] README: problem, architecture, setup, research citations, and the **four differentiators vs AgentMesh** (N-way, longitudinal, fairness-governed, domain-specific)
- [ ] `make demo` verified from a genuinely clean clone
- [ ] **Devpost draft submitted** - all fields, even if rough. It can be edited until the deadline.
- [ ] Fill in the placeholder table in `CLAUDE.md` §2

---

### Block 4 - Ashfaq · Sat 13 Sep evening

- [x] Tier 7 evals: fairness invariant, **privacy adversarial eval**, escalation precision/recall, precedent regression (`python -m evals`)
- [x] Rebuilt `app/`, the family-facing product, on the real fairness engine, with a front door that offers the demo or an empty circle a judge can set up and use. See `CLAUDE.md` §15.
- [ ] Clean-clone QA - follow the README exactly as a stranger would and file what breaks
- [ ] Gather video assets: screen recordings of each §8 beat, at high resolution, before the script exists

---

### Block 5 - Both · Sun 14 Sep

**Shawki**
- [ ] Video script from `CLAUDE.md` §8 - timed to 3:30, word-for-word, handed to Ashfaq **early in the day**
- [ ] Presentation deck / slides
- [ ] Devpost project description - what it does, who it's for, how it works
- [ ] Blog post 1 - *"Agents for Humans: Teaching an Agent to Keep a Secret"*
- [ ] Blog post 2 - *"Agents for Humans: Fair Division as a Deterministic Tool"*
- [ ] AWS Builder ID entered; track confirmed (see `CLAUDE.md` §2 - still open)
- [ ] Final submit

**Ashfaq**
- [ ] Record voiceover and screen capture from the script
- [ ] Edit to **3:30** (hard cap 5:00), upload to YouTube as **public**
- [ ] Blog post 3 - *"Agents for Humans: Building an Agent That Refuses to Decide"*
- [ ] Final watch-through: does it cover the problem, who it's for, and why it matters?

> **The three blog posts are worth up to +0.6.** Top submissions cluster at 4.2–4.7, so this is
> likely the difference between winning and placing. All three must be publicly published on
> builder.aws.com **before** the deadline, each with "Agents for Humans" in the title.

---

## 4. Handoff protocol

Because you are never online together, the repo has to speak for you.

1. **Work directly on `main`.** No branches - you never overlap, so branching only adds merge pain.
2. **Never hand off broken.** If a block runs out of time, commit what works, and write the unfinished
   part into `CLAUDE.md` §15 as an explicit TODO with what you tried.
3. **Every handoff commit** uses the message format above and includes:
   - Ticked boxes in `CLAUDE.md` §12
   - A session-log entry in `CLAUDE.md` §15: what you did, what you did not, what is fragile
   - Any new fixtures
4. **Message the other person "pushed, your turn"** outside the repo. Do not assume they are watching.
5. **The incoming person's first action** is to run the previous block's Definition of Done. If it
   fails, fix it or log it before starting new work - never build on top of an unverified handoff.

---

## 5. Blockers to clear early

| Blocker | Owner | When | Why it matters |
|---|---|---|---|
| **IAM user for Ashfaq** (`bedrock:InvokeModel`, us-east-1) | Shawki | **Day 1** | Without it Ashfaq cannot run anything live for two days |
| Committed `fixtures/` from real runs | Shawki | End of Block 1 | Lets Ashfaq build the entire UI without AWS at all - the real safety net |
| $50 AWS credits request | Shawki | **Before Fri 11 Sep, 12:00pm PT** | Form closes; no extensions |
| Devpost registration + AWS Builder ID | Both | Day 1 | Builder ID is a mandatory submission field |
| Public GitHub repo + MIT license visible in About | Shawki | Day 1 | A submission requirement, not a nicety |
| Video script delivered to Ashfaq | Shawki | **Early Sun 14** | Ashfaq cannot start editing without it - this is the tightest dependency in the plan |

---

## 6. If we fall behind

Cut in this order. Never improvise the order under pressure.

1. **Tier 7 evals** - nice credibility, not visible in the demo
2. **Tier 5 precedent learning** - costs the video its final arc, but the product still stands
3. **Tier 8 AgentCore deploy** - drops the live-demo bonus; keep the local demo working
4. **Never cut:** Tier 4 guardrails, Tier 6 product surface, the video, or the three blog posts.
   Those four are where the marks are.

---

## 7. Shared rules

- Both of you follow `CLAUDE.md` §1 Hard rules. The product invariants are not negotiable -
  especially *the agent never makes the human decision* and *fairness never goes through an LLM*.
- Never claim something works without running it and pasting the output.
- No credentials in the repo, ever. Not in `.env`, not in a fixture, not in a screenshot in the video.
- Update `CLAUDE.md` at the end of every working session, even a short one.
- If you disagree with something in `CLAUDE.md`, change the file - do not work around it silently.
  The next person will trust what is written there.
