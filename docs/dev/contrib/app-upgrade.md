---
description: How clients check for updates through the managed release service, with channels and the release history feed
sources:
  - src/main/services/AppUpdaterService.ts
  - resources/cherry-studio/release-history.json
  - electron-builder.yml
  - dev-app-update.yml
---

# App Update Architecture

## Overview

This fork checks for updates from the Latest Release at `Kon-x/cherry-studio`. It follows only official stable upstream tags and does not request upstream beta or RC builds.

The in-app release history comes from the `release-history.json` asset on the fork's Latest Release. Each build also bundles the repository file as an offline fallback.

History accepts official stable versions and normal fork releases named `x.y.z-kx.n`. Fork revisions appear before
their upstream base and sort by numeric revision. Beta and RC entries remain excluded. Generate the current entry
from `electron-builder.yml` with `node scripts/release/sync-release-history.js --target-version <version>` so the
online history, offline fallback, and current release notes agree.

## Update Feed Configuration

- Packaged builds use the generic GitHub Latest Release URL from `electron-builder.yml`. electron-builder writes this value to the packaged `app-update.yml`.
- Development builds set `forceDevUpdateConfig = true`, so electron-updater reads `dev-app-update.yml` from the repository root. The default development feed is `http://127.0.0.1:3378`.
- Production base URL changes take effect through the build configuration in newly produced application builds. The client does not override the packaged feed URL at runtime.

## Channels

The client always selects electron-updater's `latest` channel. Legacy Test Plan preferences are ignored, and the About page does not expose RC or Beta controls.

## Request Contract

Before each update check, the client preserves existing updater headers and sets these values:

| Header | Value |
| --- | --- |
| `Client-Id` | Persistent client identifier |
| `App-Name` | Application name |
| `App-Version` | Installed version with a `v` prefix |
| `OS` | `process.platform` value |
| `X-Region` | `cn` for China, otherwise `global` |
| `User-Agent` | Generated Cherry Studio user agent |
| `Cache-Control` | `no-cache` |

The updater requests `latest.yml`; no separate release-channel header is sent.

## Differential Downloads

NSIS builds generate differential packages and companion `.blockmap` assets. The existing release workflow uploads these assets and mirrors them to GitCode alongside the installers. Global, China edition and development generic feeds use single-range requests (`useMultipleRangeRequest: false`); HTTP 206 support does not imply multipart-range support.

The client enables electron-updater's native differential downloader while keeping the existing managed feed, target-version selection and regional mirror routing. Where the platform updater supports differential downloading, it reuses its cached base and fetches changed ranges to reconstruct a complete package. Missing blockmaps, missing base packages or differential download errors fall back to the updater's full download path. Existing installations without usable base metadata may need a full update before benefiting from differential downloads.

Both old and new version blockmap URLs must remain available through the existing download routes. Validate redirects and Range responses on GitHub and GitCode before rollout; an installer accepting Range requests alone is insufficient. This change reduces download traffic, not the full extraction/replacement work performed after application exit. It does not change installer identity, data migration or the explicit installation action.

## Check Lifecycle

Manual checks are available in development and packaged, non-portable builds. Portable builds do not perform update checks. Packaged, non-portable builds also schedule automatic checks in the main process. Successful checks return to the normal cadence, while failed scheduled checks use exponential backoff before retrying. Update events and download progress continue to reach the main window through IpcApi.

The main process compares a `not_available` result's feed target with the installed version. When the two differ — a withdrawn or stale feed naming an older target, or a staged rollout not yet offered — the result is treated as withheld rather than current: the main process logs both versions, and a manual check offers the GitHub Releases download instead of the up-to-date message. Only `isCurrent` is sent to the renderer. A prerelease install is treated as current unless the feed advertises a newer version; missing or unparseable feed versions are treated as current. Background checks stay silent.

## Upgrade Release Notes

For stable upgrades from x to y, About settings and the installation dialog request `app.updater.upgrade_notes.get`. The main process derives x from the installed application and selects managed history records in `(x, y]`, sorted by semantic version. This read does not query the latest release or trigger an update check or download. Prerelease upgrades continue to show their target notes because the history feed contains only stable releases.

With multiple available versions, both surfaces show a descending version timeline with every release collapsed initially. A single available version shows its full notes directly, without range/count metadata, a timeline, or a version toggle. Loading/failure status and retry remain available in either layout. Each row expands independently to show its complete localized Markdown, preserving headings, notices, code, links, and footnotes in the originating release's scope. The installed version marks the end of the timeline. There is no cross-version entry deduplication, category overview, or original-notes toggle. Retry and language changes preserve expanded rows; changing the target resets them.

History loading and failure never disable installation. Available target notes remain visible during loading and serve as fallback when managed history is unavailable or lacks the target. A failed request offers retry; a missing target without fallback is reported separately. The interface omits separate range summaries and loaded-version counts and does not promise publisher completeness. The standalone history page keeps its existing latest-release and bundled fallback behavior.
