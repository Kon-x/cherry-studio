# App Update Architecture

## Overview

This fork checks for updates from the Latest Release at `Kon-x/cherry-studio`. It follows only official stable upstream tags and does not request upstream beta or RC builds.

The in-app release history comes from the `release-history.json` asset on the fork's Latest Release. Each build also bundles the repository file as an offline fallback.

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

## Check Lifecycle

Manual checks are available in development and packaged, non-portable builds. Portable builds do not perform update checks. Packaged, non-portable builds also schedule automatic checks in the main process. Successful checks return to the normal cadence, while failed scheduled checks use exponential backoff before retrying. Update events and download progress continue to reach the main window through IpcApi.
