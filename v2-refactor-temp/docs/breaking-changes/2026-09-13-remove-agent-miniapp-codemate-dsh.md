---
title: Work, Mini Apps, Code Mate, and DSH removed from the fork
category: removed
severity: breaking
introduced_in_pr: pending-local-change
date: 2026-09-13
---

## What changed

The launchpad now contains Chat, Paintings, Translate, Knowledge, Files, and Notes. Work/Agents, Mini Apps, Code Mate, DSH, Agent skills and scheduled tasks, and the built-in Cherry Assistant/Support Agents are removed. Help and release notes open in the system browser; feedback retains diagnostics and GitHub.

## Why this matters to the user

Old Agent and mini-app favorites, launchpad entries, tabs, and search recents disappear. Valid tabs and favorites retain their order; upgrades with no surviving tabs open Launchpad, while new installations open Chat. Old Agent schedules remain stored but do not run.

## What the user should do

Use ordinary Cherry chat or custom assistants, with MCP, web search, knowledge tools, and normal tool approvals. Claude and DeepSeek API models and Codex/Grok chat login remain supported. User history, attachments, usage records, mini-app files, working directories, and external CLI installations/configuration remain on disk; this upgrade does not uninstall or clear them.

## Notes for release manager

Supersedes the earlier Agent/mini-app/Code Mate feature notices for this fork. Keep all shipped SQLite migrations and historical file references. Replace `introduced_in_pr` with the resulting PR number or commit hash when the local change is published.
