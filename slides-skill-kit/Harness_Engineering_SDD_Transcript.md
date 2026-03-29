# Harness Engineering — Presenter Transcript

---

## Slide 1: Title

> Hey everyone, thanks for joining. Today I want to share something we've been building called Harness Engineering — it's about how we make AI agents actually reliable enough for real engineering work. And I'll show you how we've applied it to our delivery lifecycle.

---

## Slide 2: Agenda

> Here's the plan. First half — I'll start with the theory: what is Harness Engineering, what are the mental models that don't change. Then I'll show how we put those into practice with our AI-SDLC. Second half — SDD, which is the specific development workflow, plus a recorded demo. And 10 minutes for questions.

---

## Slide 3: What's Changed?

> So what's actually changed? Here's the thing — the bottleneck isn't writing code anymore. It's the quality of the environment that the agent works in. If the environment is messy, the agent produces mess.
>
> Look at the left side. This is what it looks like without structure. You're throwing ad-hoc prompts at an AI, there's no contract, no spec. You get hallucination, you get drift, and the only way to catch problems is someone manually reviewing everything. Your most expensive resource — human attention — gets burned on stuff that shouldn't need a human at all.
>
> Now look at the right side. With a structured SDLC, you've got contracts at every level. Constraints that are enforced by tools, not by a wiki page that nobody updates. Quality that's deterministic — same input, same output, every time. And humans? They focus on the things that actually need human judgment — not catching typos.

---

## Slide 4: What is Harness Engineering?

> So what is Harness Engineering exactly? Think of it this way — it's the discipline of building the scaffolding, the contracts, and the guardrails that make AI agents work reliably at scale.
>
> Three pillars. First, **scaffolding** — you structure the work so the agent can actually succeed. You give it context through steering files, you break tasks down to a manageable size. Second, **contracts** — at every level you define what goes in, what comes out, and how you validate it. Before the agent starts, it knows exactly what "done" looks like. Third, **guardrails** — automated quality checks that run inside the loop. Not a doc that says "please follow this pattern" — actual tooling that enforces it.

---

## Slide 5: Mental Models (Part 1)

> Before I show you how we implement this, I want to lay out the mental models. These are the principles that don't change — even as tools, models, and practices evolve.
>
> On the left — the agent's fundamental limitations. First: **the environment is the bottleneck, not the agent.** The agent is powerful but directionless without structure. If you invest in anything, invest in the harness. Second: **agents can't evaluate their own work.** They'll confidently tell you everything is fine when it's not. That's why we use deterministic tools and human gates — we never ask the agent "are you done?"
>
> On the right — input determines output. **Your output is the agent's input.** Every role's decisions feed the agent directly. Vague requirements produce vague output. Incomplete criteria produce incomplete tests. The agent multiplies whatever you give it. And: **if it's not in the repo, it doesn't exist.** Knowledge in people's heads, in Slack, in Confluence — all invisible to the agent. The repository must be the single source of truth.

---

## Slide 6: Mental Models (Part 2)

> Continuing with the mental models.
>
> On the left — reliability engineering. **Mechanical enforcement beats documentation.** If a rule matters enough to write down, it matters enough to enforce with a tool. We use steering files, linters, CI — not wiki pages that drift from reality. **Decompose until reliable** — break tasks down until each unit is within the LLM's reliable window. Same principle as distributed systems: unreliable components, reliable pipeline. And an important one: **every harness component is an assumption** about what the model can't do. As models improve, those assumptions go stale. Stress-test them. Remove what's no longer needed.
>
> On the right — economics and context. **Corrections are cheap, waiting is expensive.** Re-running an agent costs almost nothing. A human waiting for a review cycle costs real time. This changes every engineering tradeoff. And **context engineering** — deliberately manage what the agent sees at each stage. Every token in context competes with the task. Less noise, fewer errors.
>
> These mental models are stable. The practices that implement them will evolve. Let me show you our current practice.

---

## Slide 7: The Mindset Shift

> One more thing before we get into the SDLC. Maybe the most important point in this whole presentation.
>
> The process hasn't fundamentally changed. Requirements, design, implementation, testing — same phases. What's changed is the mindset. So what does this mean for each of us?
>
> Look at the cards. The BA makes scope decisions — right scope means right product. The Architect picks patterns — right patterns mean right system. The Developer decides how to decompose — that determines whether the agent can handle the work. QA defines acceptance criteria — right criteria mean right quality. The Designer defines flows — right UX means right experience.
>
> Every one of these decisions used to affect just the next person in the chain. Now it feeds an agent that amplifies it at machine speed. The quality of our decisions directly determines the quality of our product.

---

## Slide 8: AI-SDLC — Full Lifecycle

> Now let's see how those mental models become a real delivery process. Here's the big picture — our AI-SDLC in four phases.
>
> **Phase 0** is Requirements. The BA owns this. They draft the Feature Set, then agents come in to validate it — checking contracts, mapping dependencies, scoring readiness. Stakeholders sign off at the gate.
>
> **Phase 1** is Architecture Alignment. The Architect owns this. The agent drafts the alignment document using actual references to our codebase — not made-up patterns. A script verifies those references are real. The Architect reviews and approves at every step.
>
> **Phase 2** is where the actual building happens. Dev and QA work in parallel. The developer goes through the SDD flow, while QA is writing acceptance criteria at the same time. At PR review, QA verifies the BDD tests against their AC.
>
> **Phase 3** is Integration QA. QA takes the deployed build and tests it against the acceptance criteria they wrote earlier. If something fails, it gets triaged back to the right phase. Bug in the code? Back to Phase 2. Gap in the design? Back to spec-design. Requirement was ambiguous? All the way back to Phase 0. When all must-have criteria pass, the feature is done.
>
> You can see the mental models in action — contracts, enforcement, human gates at every transition.

---

## Slide 9: Phase 0 — Requirements

> Let's look at Phase 0 in detail. This is the BA's territory.
>
> It starts with the BA drafting the Feature Set — FR table, BR table, assigning a Feature Set ID. Pretty standard so far.
>
> Then agents kick in. First, the brd-scan agent runs 7 automated checks on the BRD — think of it as a quality gate for the requirements document itself. Then dependency-map-sync registers this feature in our dependency registry so we know what depends on what. And finally, fs-readiness scores the feature across five dimensions — three of those are automated, and two need the Architect to answer some questions.
>
> After all that, the BA and stakeholders do the actual sign-off. That's the gate into Phase 1.
>
> See the pattern? The human starts the work, agents validate and enrich it, and then the human makes the final call.

---

## Slide 10: Phase 1 — Architecture Alignment

> Phase 1, owned by the Architect. There are seven steps here — I've laid them out in two rows.
>
> Let me walk you through the top row. Step 1 — the agent drafts an alignment document. What's special is that it looks at our target platform code and cites real patterns, real APIs, real file paths. The design is grounded in our existing architecture, not what the agent imagines. We call these codebase-verified citations. Step 2 — a deterministic script — not another LLM — verifies every citation: does the file exist? Are the line numbers valid? Step 3 — the Architect reviews the draft and verification report, then fills out a decision checklist — things like which reference module to use, where to put the new code, how to model the data. Step 4 — the agent drafts cross-repo API contracts.
>
> Bottom row. Step 5 — the agent proposes an execution order, figuring out which things need to be built first. Step 6 — the Architect reviews and signs off. Step 7 — the agent assembles the steering files, runs 9 validation rules, and creates PRs in every affected repo.
>
> The gate to Phase 2: alignment must be approved, all functional requirements mapped, contracts defined.
>
> Here's what I want you to notice — the agent drafts, a deterministic tool verifies, and the human approves. At every step. We don't rely on the agent to check its own work. That's by design — remember, agents can't evaluate their own work.

---

## Slide 11: Phase 2 — Parallel Execution

> Phase 2 — this is where the code actually gets written.
>
> Top lane is the **SDD Track**. The developer starts by checking that the steering files are in place. Then the agent runs spec-requirements, then spec-design — which handles all the architectural thinking. The developer reviews what comes out. Then spec-tasks breaks it down, developer reviews again, and finally spec-impl writes the actual code following TDD. At the end, validate-gap checks if anything was missed. If there are gaps, it loops back. If it's clean, the developer raises a PR.
>
> Bottom lane is the **QA Track**, and this starts at the same time. QA doesn't wait for dev to finish. They start writing acceptance criteria right away — turning business rules into BDD scenarios — and they review design.md for testability when it's ready.
>
> These two tracks meet at **PR Review**. QA takes the acceptance criteria they defined and checks: do the BDD tests actually cover what we said they should? Are the scenarios right? Dev looks at code quality. Then merge.
>
> The way I think about it: QA defines what "done" looks like, the SDD flow produces the tests to prove it, and QA verifies the proof. Going forward, we want to use agents to help QA generate that initial set of acceptance criteria from the business rules — but that's next phase.

---

## Slide 12: Phase 3 — Integration QA

> Phase 3, owned by QA. This is where it all comes together.
>
> QA takes the deployed build and runs it against the acceptance criteria they wrote back in Phase 2. This is integration-level testing — not unit tests, but validating actual user flows against the criteria.
>
> If everything passes — feature done. Should Have failures get tracked as follow-on feature sets, not blockers.
>
> But if Must Have criteria fail, it doesn't just sit there. The failure gets triaged back to the right phase. Bug in the implementation? Back to Phase 2. Design gap? Back to spec-design. Requirement was ambiguous or missing? All the way back to Phase 0. The pipeline is a closed loop — failures re-enter at the right point.
>
> When a feature is marked done, two agents fire automatically: metrics-update calculates cycle days and refreshes the summary, and dependency-map-sync unblocks any feature sets that were waiting on this one.

---

## Slide 13: Who Does What

> This is your cheat sheet. Keep a photo of this one.
>
> BA owns Phase 0 — drafting the Feature Set, dealing with scan findings, getting sign-off. Architect owns Phase 1 — they're the gatekeeper for every draft, every contract, every phasing decision. Developers own the SDD track in Phase 2 — they review what the agent produces and raise the PR. QA works in parallel during Phase 2 writing acceptance criteria, then owns Phase 3 for integration testing.
>
> And Designers — they contribute throughout with UI/UX flows in Figma. The agent can actually access those designs through Figma MCP.
>
> The point is: everyone has a defined role in the harness. Nobody's guessing what they're supposed to do.

---

## Slide 14: Section — Spec-Driven Development

> Alright, let's get into SDD — Spec-Driven Development. This is the specific workflow that brings the SDLC into practice.

---

## Slide 15: SDD — Four Phases

> SDD has four phases, and they flow as a pipeline — each one feeds the next. There's also a setup step — spec-init — that creates the workspace, but the real flow starts with requirements.
>
> **spec-requirements** reads all the steering files — the project context, the feature requirements that were injected in Phase 1 — and generates formal requirements in EARS format. It also produces a research.md documenting what it discovered about the schema, existing patterns, and constraints. The developer reviews this before moving on.
>
> **spec-design** is the architecture phase. The agent designs APIs, data models, boundaries — and produces design.md. The developer reviews carefully.
>
> **spec-tasks** takes that design and breaks it into atomic tasks. Each task is linked to specific functional and business requirements. This produces tasks.md with a dependency graph.
>
> **spec-impl** is the build phase. For each task, the agent follows TDD — write tests first, implement to pass, commit. At the end, validate-gap checks for coverage holes.
>
> Everything is concrete, version-controlled, traceable.

---

## Slide 16: SDD Detail — spec-requirements & spec-design

> Let me zoom into the first two phases.
>
> **spec-requirements** on the left. The agent reads all the steering files — project context, tech stack constraints, the feature requirements that were injected from Phase 1. From that, it generates formal requirements in EARS format — "When X happens, the system shall do Y." It also produces research.md, which documents what it discovered: schema details, existing patterns, potential gotchas. The developer reviews this before proceeding.
>
> **spec-design** on the right. The agent reads the approved requirements plus all steering files, and designs the architecture — APIs, data models, component boundaries. The output is design.md. And here's the important part — the developer doesn't just glance at it. There's a proper review checklist: FR and BR coverage, architecture compliance, testability. If it doesn't pass review, it goes back for another round.

---

## Slide 17: SDD Detail — spec-tasks & spec-impl

> Second half of SDD.
>
> **spec-tasks** — the agent reads design.md and breaks it into atomic tasks. And I mean properly atomic — each task is tagged with which FR and BR it addresses. It also builds a dependency graph so we know the order. Developer reviews this to make sure the scope is right.
>
> **spec-impl** — this is where code gets written. For each task, the agent follows TDD: write the tests first, then implement until the tests pass, then make an atomic commit. That cycle repeats for every single task. At the very end, validate-gap runs as a final check — did we miss any FR or BR coverage? If yes, loop back. If clean, raise the PR.
>
> Think of validate-gap as the safety net. It catches the things that individual task-level TDD might miss.

---

## Slide 18: What the Output Looks Like

> Before we talk about patterns, let me show you what these artefacts actually look like. I think this makes it much more concrete.
>
> On the left — **requirements.md**, the output of spec-requirements. Formal EARS-format requirements plus the research discoveries — schema details, patterns, constraints the agent found in the codebase.
>
> In the middle — design.md, the output of spec-design. API endpoints, data models, architecture decisions. This is what the developer reviews.
>
> On the right — tasks.md, the output of spec-tasks. Atomic tasks, each linked to FRs and BRs, with a dependency graph showing the order.
>
> The point is: every phase produces something concrete and version-controlled. Nothing lives in a chat window or someone's head.

---

## Slide 19: Design Patterns

> Six patterns we've found essential. Let me call out a few.
>
> **Steering files** — these aren't static documentation. They're a living constraint system. When the agent runs into a problem, we update the steering file. Next time, it doesn't make the same mistake. The file evolves with the project.
>
> **Progressive disclosure** — this one is subtle but important. Every token you put in the agent's context competes with the actual task. So we only show the agent what it needs at each stage. Less noise, fewer errors. This is context engineering in practice.
>
> **TDD/BDD** — tests are the source of truth, not documentation. Why? Because documentation that isn't mechanically enforced will drift from reality. Tests can't — they either pass or they don't.
>
> The other three are on the slide: plan first, atomic commits, and iterate on the harness — meaning when agents keep making the same mistake, fix the environment, not the output.

---

## Slide 20: Orchestration — Opus + Sonnet

> This is how we handle parallelism. It's a two-tier pattern.
>
> Opus sits at the top as the orchestrator. It's the more capable model — better at complex reasoning, planning, breaking down work into waves. It decides what gets done in what order and sets the context for each worker.
>
> Then it fans out to multiple Sonnet instances running in parallel. Sonnet is faster and cheaper — perfect for focused, well-specified tasks. Each worker handles one task independently.
>
> When a wave finishes, Opus collects the results, checks quality, and plans the next wave. Wave 1 is the foundation — tasks with no dependencies. Wave 2 builds on Wave 1. And so on until everything is complete.
>
> You get the best of both worlds: Opus for quality thinking, Sonnet for speed.

---

## Slide 21: The Repository

> This slide brings together two ideas that are really the same thing: the repository as the source of truth, and Git as cognitive scaffolding.
>
> Left column — what feeds the repo. Tests — because specs go stale but tests don't lie. Steering files with architecture decisions baked in. Figma designs accessible via MCP so the agent can actually see the UI. And alignment documents with all the FR/BR decomposition.
>
> Centre column — Git as scaffolding. Commits aren't just history — they're recovery mechanisms. Agent goes down a wrong path? Roll back. Branches aren't just for isolation — they're safe spaces for experiments. And you've got a full audit trail of every decision.
>
> Right column — what agents get from all this. Context to understand the task. Constraints to stay within bounds. Validation to verify their work.
>
> Remember the mental model: if the agent can't find it in the repo, it doesn't exist.

---

## Slide 22: How We Measure Success

> You can't improve what you can't measure. We track five categories of metrics.
>
> **Throughput** — how fast are we delivering? Time-to-first-PR, time-to-merge, tasks per day.
>
> **Quality** — how good is the output? CI pass rate, defect escape rate, how often does validate-gap pass on the first try.
>
> **Human attention** — this is an interesting one. How many minutes does a human spend reviewing each PR? How many escalations? What percentage of tasks actually need human judgment? If this number is going up, something in the harness needs fixing.
>
> **Harness health** — is the harness itself in good shape? Are docs fresh? Are architectural boundaries being respected? Are steering files covering what they should?
>
> **Delivery cycle** — the big picture. How many days from BRD to Feature Done, per feature.
>
> The nice thing is: we don't track most of this manually. The metrics-update agents trigger automatically at key events — alignment approved, design approved, gap passed, PR merged, feature done. All written to metrics.md in the source-of-truth repo.

---

## Slide 23: Demo Context — CSI Incident Management

> Before I play the demo, let me give you some context so you know what you're looking at.
>
> CSI Incident Management is the feature we built this with. It spans three repos. **infomedia-nexus** is our source of truth — all the docs, requirements, alignment artefacts live here. **infodrive-cx-api** is the backend — Python Lambdas, 15 REST endpoints, full database schema. **infodrive-cx-ui** is the frontend — Next.js 15, Admin and Dealer portals, built using our design system components and referencing the legacy Mashi UI.
>
> In the demo you'll see the full SDD flow in action: spec-requirements generating formal requirements from the steering files, spec-design producing the architecture, spec-tasks breaking it down into tasks, and spec-impl building it with TDD.

---

## Slide 24: Recorded Demo

**[Play screen recording — sdd-demo-screen-recording.mov]**

*As you play the recording, call out key moments: "Here you can see it reading the steering files..." / "Now it's generating the requirements in EARS format..." / "This is the developer review step — notice the checklist..." / "And here's validate-gap running at the end..."*

---

## Slide 25: Key Takeaways

> Eight things I'd like you to take away from today.
>
> One — the bottleneck isn't the agent. It's the environment. Invest in the harness.
>
> Two — agents can't evaluate their own work. Use deterministic tools and human gates.
>
> Three — your output is the agent's input. Decision quality at every role determines product quality.
>
> Four — if it's not in the repo, it doesn't exist.
>
> Five — AI-SDLC: four phases with human gates. Agent drafts, human decides.
>
> Six — SDD: requirements, design, tasks, implement — a repeatable pipeline within Phase 2.
>
> Seven — mechanical enforcement. If it matters enough to document, enforce it with tooling.
>
> Eight — every harness component is an assumption. Stress-test as models improve.

---

## Slide 26: Adoption Roadmap

> So how do we actually get there? Phased approach, not a big bang.
>
> **Now** — we're in the foundation phase. CSI Incident Management is our proof of concept. We're validating the full pipeline end-to-end and learning from it. One feature, one team.
>
> **Next** — we expand. Take on 2-3 more feature sets, get more devs and QAs using SDD. We also want to start bringing agents into the QA track — generating initial acceptance criteria from business rules, auto-mapping BDD coverage. Build shared templates and review standards across the team.
>
> **Later** — we scale across projects. Add entropy management — background agents scanning for pattern drift and stale docs. Bring in browser automation with Playwright MCP so we're not just checking code coverage, we're testing the actual running UI. Build runtime observability.
>
> **Long-term** — full maturity. Autonomous loop for routine features. Agent security hardened. Harness versioning. And remember the mental model: periodically question every component of the harness. Each one is a bet on what the model can't do. As models get better, some of those bets become wrong. Remove what's no longer needed. Don't let the harness become its own kind of tech debt.
>
> Each phase builds on the last. We invest in structure, not workarounds.

---

## Slide 27: Q&A

> That's it from me. Thank you for your time. I'd love to hear your questions — about the theory, the process, the tooling, the demo, or how this applies to your work.
