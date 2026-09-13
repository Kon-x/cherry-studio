---
description: Stable upstream sync, fork invariants, and the Windows x64 release flow for the Kon-x fork
---

# Fork Release Guide

This repository follows only official stable Cherry Studio tags and publishes Windows x64 builds from the fork.
Do not merge `upstream/main`, beta tags, or RC tags into `main`.

## Fork Customizations

- Work/Agents, Mini Apps (web and local), Code Mate, DSH, Agent skills/tasks, and the built-in assistant/support
  Agents remain removed. The launchpad contains Chat, Paintings, Translate, Knowledge, Files, and Notes.
- The API Gateway, all channel adapters, and their runtime/lifecycle registration remain removed.
- Normal Cherry chat, custom assistants, MCP, knowledge retrieval, tool approvals, generic background jobs,
  and dependency management remain supported. Claude and DeepSeek API providers and Codex/Grok chat login remain.
- Historical Agent/mini-app tables, shipped migrations, file references, usage rows, user files, working directories,
  and external CLI installations/configuration are retained. No upgrade cleanup may delete them.
- Retired favorites, tab URLs, launchpad entries, and search recents are filtered during restoration. Fresh installs
  open Chat; upgrades with no surviving tabs open Launchpad. Schedules without a registered handler stay dormant.
- Provider login windows retain proxy, language, and UA configuration. Chat HTML previews remain available.
  Help and release notes open in the system browser; feedback offers diagnostics and GitHub.
- Preset providers can be deleted, deleted presets stay tombstoned until recreated manually, and providers support
  batch deletion.
- Selection Assistant explanations always use web grounding.
- PDF (BabelDOC) translation talks to the selected provider's own OpenAI-compatible endpoint instead of the removed
  gateway, and rejects providers that do not expose one.
- `.github/workflows` contains only the fork checks and Windows x64 build/release workflows.

Run `pnpm fork:check` after every upstream merge. It fails if any protected deletion or dependency returns.

## Recurring Merge Conflicts

Each upstream sync hits the same shapes:

- Deleted-by-us gateway/channel/Agent/mini-app/CLI files reappear as `DU` conflicts — `git rm` them all.
- Any new upstream code that calls `application.get('ApiGatewayService')` must be rerouted to a direct provider
  connection or made to reject; `pnpm fork:check` catches every call site.
- `docs/README.md` is generated — resolve with the upstream side and re-run `pnpm docs:index`. Removing a docs
  domain also means removing it from `REFERENCE_DOMAINS` in `scripts/verify-doc-structure.ts` and the label map in
  `scripts/gen-doc-index.ts`.
- Locale catalogs lose the fork's own keys during the merge: run `pnpm i18n:sync`, then translate every
  `[to be translated]:` marker — `pnpm i18n:check` rejects the markers.
- `pnpm-lock.yaml`: resolve with the upstream side, then regenerate with `pnpm install --lockfile-only`.

## Signing Setup

Commits must use a repository-specific SSH signing key and include a DCO trailer:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/cherry-studio-signing -C '<github-email>'
git config --local gpg.format ssh
git config --local user.signingkey ~/.ssh/cherry-studio-signing.pub
git config --local commit.gpgsign true
git commit -S --signoff
```

Register the public key as a GitHub **Signing key**, then verify both locally and on GitHub:

```bash
git cat-file commit HEAD | rg 'gpgsig|Signed-off-by'
```

## Stable Upstream Sync

Resolve the latest non-draft, non-prerelease upstream release and inspect its tag before changing the worktree:

```bash
stable_tag=$(gh api repos/CherryHQ/cherry-studio/releases/latest --jq .tag_name)
case "$stable_tag" in *-beta.*|*-rc.*) exit 1;; esac
git fetch upstream "refs/tags/$stable_tag:refs/remotes/upstream-tags/$stable_tag" --no-tags
git switch -c "sync/upstream-$stable_tag" origin/main
git merge --no-ff --no-commit "refs/remotes/upstream-tags/$stable_tag"
```

Never create the unmodified upstream tag in the fork. Resolve conflicts using the tagged upstream structure as the
baseline, then restore the fork behavior listed above. Regenerate `pnpm-lock.yaml` with the pinned Node and pnpm
versions; do not hand-edit it. Preserve upstream dependency and patch changes except the removed channel, Claude Agent SDK, Pi, and DSH stacks and their patches.

Commit the merge without flattening its two parents:

```bash
git add -A
git commit -S --signoff -m "chore(upstream-sync): merge $stable_tag"
git show -s --format=raw HEAD
```

Prepare the fork version in a second signed commit. For upstream `x.y.z`, use `x.y.z-kx.n`, update bilingual notes,
and open a PR to `main` for the CI verification below. Merge it with a merge commit;
squash and rebase merges destroy the upstream ancestry used by the next sync.

## Verification

Use the existing **Checks** and **Build Windows x64** PR workflows as the completion gate. Require both to succeed
for the latest PR commit; an earlier successful run does not validate follow-up changes. A draft PR runs the same
checks and build without publishing a release.

- **Checks** retains the full test suite, formatting, types, translations, docs, strict lint, and fork invariants.
  It checks the migration chain, protects the SQL, snapshots, and existing journal entries shipped in
  `v2.0.14-kx.1`, then generates migrations and rejects tracked or untracked schema drift.
- **Build Windows x64** builds natively on Windows and inspects `app.asar` plus its external resources for retired
  SDKs, compiled runtimes, preloads, and bundled assets. Generic provider icons and historical data types are valid.
  Playwright then exercises Chat/Launchpad, persisted streaming chat, MCP allow/deny, knowledge indexing and recall,
  provider login session settings, HTML previews, and system-browser help links. Each Electron instance has a
  temporary profile; model, embedding, MCP, and login traffic use local test services.
- Failed Electron runs upload logs, screenshots, and traces as `electron-verification-<run-id>`. Windows builds
  upload the validated installers and checksums. Setup and portable sizes are compared with `v2.0.14-kx.1` in
  the Actions summary and `windows-x64-size-comparison-<run-id>` artifact, using release asset metadata.

For local reproduction, use the pinned Node and pnpm versions and the corresponding commands:

```bash
pnpm install --frozen-lockfile
pnpm fork:check
pnpm lint
pnpm test
pnpm docs:check
pnpm test:lint
pnpm db:migrations:check
pnpm db:migrations:generate
git status --short -- migrations/sqlite-drizzle
pnpm build
pnpm test:e2e
```

Confirm the focused contracts: provider tombstones and manual recreation, batch deletion, web-grounded explanation,
gateway rejection, retired navigation filtering, historical data retention, and dormant retired schedules. The PR
`Build Windows x64` artifact must contain exactly one setup installer, one portable executable, and one valid
`latest.yml`. Passing verification does not authorize merging or releasing; those are separate steps.

## Release

After the synchronization PR is merged, run **Build Windows x64** from `main` with the exact `package.json` version.
The workflow rejects any other ref/version and requires a successful `Checks` run for the same SHA. Its protected
`release` environment creates `v<version>` as a normal Latest Release and uploads:

- Windows x64 setup and portable executables
- `latest.yml`
- `release-history.json`
- `SHA256SUMS.txt`

The first fork build must be installed manually because older packages still use the upstream feed. Setup builds
from `kx.1` onward update from the fork; portable builds remain manual. Windows binaries are not Authenticode-signed
and may trigger SmartScreen. Commit signing and Windows code signing are separate mechanisms.

After publishing, verify that the tag points to the merged `main` SHA, all assets download, checksums match, and
`https://github.com/Kon-x/cherry-studio/releases/latest/download/latest.yml` plus its setup URL return successfully.

## Rollback

Before publishing, close the PR or revert the merge commit with `git revert -m 1 <merge-sha>`. After publishing,
never move, replace, or delete the old tag. Fix the issue on `main` and publish the next `kx` revision, for example
`2.0.7-kx.2` / `v2.0.7-kx.2`. Do not change `appId`, product name, or the user data directory.
