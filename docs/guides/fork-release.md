# Fork Release Guide

This repository follows only official stable Cherry Studio tags and publishes Windows x64 builds from the fork.
Do not merge `upstream/main`, beta tags, or RC tags into `main`.

## Fork Customizations

- The API Gateway implementation, settings, IPC routes, and lifecycle registration remain removed. The shared
  `agentApiGateway.ts` boundary exists only to reject routes that need the removed gateway.
- Claude Code supports direct Anthropic Messages endpoints. DeepSeek Harness supports direct providers and rejects
  Unified Gateway mode.
- Telegram, Feishu, WeChat, QQ, Discord, and Slack bot adapters remain removed. `ChannelManager` is an inert
  compatibility surface; channel database rows and shipped migrations remain intact.
- Preset providers can be deleted, deleted presets stay tombstoned until recreated manually, and providers support
  batch deletion.
- Selection Assistant explanations always use web grounding.
- `.github/workflows` contains only the fork checks and Windows x64 build/release workflows.

Run `pnpm fork:check` after every upstream merge. It fails if any protected deletion or dependency returns.

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
versions; do not hand-edit it. Preserve upstream dependency and patch changes except the three removed channel
dependencies.

Commit the merge without flattening its two parents:

```bash
git add -A
git commit -S --signoff -m "chore(upstream-sync): merge $stable_tag"
git show -s --format=raw HEAD
```

Prepare the fork version in a second signed commit. For upstream `x.y.z`, use `x.y.z-kx.n`, update bilingual notes,
regenerate the product manifest, and run every check below. Open a PR to `main` and merge it with a merge commit;
squash and rebase merges destroy the upstream ancestry used by the next sync.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm fork:check
pnpm lint
pnpm test
pnpm format
pnpm build:check
pnpm test:lint
pnpm db:migrations:check
git diff --exit-code
```

Confirm the focused contracts: provider tombstones and manual recreation, batch deletion, web-grounded explanation,
gateway rejection, direct DeepSeek Harness routing, and inert channels. The PR `Build Windows x64` artifact must also
contain exactly one setup installer, one portable executable, and one valid `latest.yml`.

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
