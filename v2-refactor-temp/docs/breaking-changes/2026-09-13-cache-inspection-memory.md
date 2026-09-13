---
title: Cache inspection stays responsive with large leftover v1 data
category: changed
severity: notice
introduced_in_pr: '#8'
date: 2026-09-13
---

## What changed

Opening Settings → Data → Clear Cache estimates leftover v1 database storage without loading its records into the interface. Large binary records no longer cause a refresh or application exit during this estimate.

## Why this matters to the user

The cleanup dialog can be opened repeatedly while retaining old conversation history and files. Database sizes reflect the browser's storage estimate; when a size cannot be attributed safely, the dialog reports that part as unknown.

## What the user should do

Nothing — automatic. Opening the dialog does not delete data; cleanup still requires selecting an option and confirming it.
