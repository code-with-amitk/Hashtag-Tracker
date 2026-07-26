# Session 1 — Design Document

**Date:** 2026-07-26  
**Tool:** Cursor  
**Status:** Complete

## User request

> Read Requirement.md document. Understand it clearly. Create a design.md document having your understanding, modules, block diagram of modules, db schema. Phased wise TODOList which are needed to cover this requirement. We need to add Unit tests as well

## AI actions

1. Read `requrirements.md`, `instructions.md`, and scanned the repo (greenfield — no source code yet).
2. Created `design.md` with:
   - Problem understanding and constraints (Express, TypeScript, Postgres, in-memory queue, node-cron, local storage)
   - Module layout under `src/` with interface-based infrastructure for future AWS swap
   - Three Mermaid block diagrams (system context, ingestion pipeline, layered architecture)
   - DB schema: `hashtags`, `media`, `sync_runs` with ER diagram and index strategy
   - `GET /hashtags` API design with cursor pagination
   - Environment variables table
   - 7-phase TODO list (Phases 0–7), each with unit test checklist
   - Testing strategy, planned tradeoffs, AWS migration path

## Human review

- All architectural decisions (dedup key, cursor pagination, abstract interfaces) were reviewed and accepted as the implementation blueprint.
- Meta API credentials from requirements will go in `.env` — not committed to git.

## Deliverable

- [`design.md`](../design.md)
