# Garments Shop Management System — Documentation

This folder is the **single source of truth** for the project.
Any AI assistant (Claude Code) or developer must read these documents **before writing a single line of code**.

## Reading order

| File | Purpose |
|------|---------|
| `01-business-overview.md` | What this business is, what the software is and is NOT |
| `02-workflow.md` | The real-life daily workflow of the shop |
| `03-modules.md` | Every module, screen by screen |
| `04-database.md` | Collections, fields, relationships |
| `05-api.md` | REST API surface |
| `06-ui.md` | Pages, layout, UX rules |
| `07-business-rules.md` | Calculation & posting rules (most important file) |
| `08-open-questions.md` | Things NOT yet confirmed — do not guess, ask |
| `09-build-plan.md` | Phase-by-phase build order for Claude Code |
| `CLAUDE.md` | Short context file to keep at project root |

## Golden rules

1. This is **NOT a POS system**. No barcode, no real-time billing, no receipt printer (unless `08-open-questions.md` is resolved to say otherwise).
2. This is a **day-end entry & accounting system**.
3. The user **enters vouchers**. The software **generates reports**. Reports are never manually typed or edited.
4. Anything not written in these documents is an **open question**, not a feature to invent.
