# Validation tooling

`pnpm check --plan` explains the checks and Vitest projects selected by `plan.mjs`.
`pnpm check` executes that plan serially; `pnpm check:all` runs the full gate.
`lint` only checks lint rules, `lint:fix` applies lint fixes, and `format` formats files.

## Change selection

The default comparison is the merge base of `origin/main` and HEAD, plus staged,
unstaged, and untracked files. `--base <parent>` supports stacked branches.
`--committed --base <commit> --head <commit>` compares exact commits for CI;
renames include both old and new paths. Missing history falls back to full validation.

Ordinary Markdown under docs, agent notes, and changesets, root Markdown, source
READMEs, and translation-pairing `.i18n.yaml` sidecars select format and documentation checks. Runtime Markdown under resources
retains full checks. Skill files select the skill gate as well. Unknown inputs,
root configuration, workflow changes, and the planner itself select all tasks.

Source changes select their project and known consumers. Shared changes select all
projects. Source changes retain full lint and i18n scans because imports and translation
references cross file boundaries. Test-only changes omit only scanners that exclude
those paths: catalog coverage ignores `__tests__` but still reads adjacent main tests;
hardcoded detection ignores `__tests__` and `.test.ts(x)`, but not adjacent `.spec.ts(x)`.
Unused-key analysis stays selected because the renderer catalog reads test sources too.
Unclassified/configuration inputs still select all checks. The planner selects whole projects;
it does not claim that file-level affected tests cover runtime dependencies.

## Execution

`--group repository|lint|types|i18n|main|renderer|packages|platform|checks|tests` restricts an
existing plan. `--shard=N/M` forwards Vitest's built-in sharding option. `--plan --json`
prints a machine-readable plan. Test commands are one Vitest invocation with explicit
projects; compilers run serially. Local Vitest defaults to two workers, overridable
through the direct Vitest command or project wrappers' `--maxWorkers` option.

Required workspace packages are built before typechecks and tests; main tests rebuild
SQLite for Node. Do not run Electron development and Node tests concurrently in one
worktree. Use isolated worktrees and dependency installations for concurrent agents.

`VALIDATION_PLAN` lets CI execute the exact plan from its classification job.
`--github-output` emits that plan and selected job groups without installing dependencies.
Unknown tasks or groups fail before execution. Summary validation rejects failed,
cancelled, missing, or unexpectedly skipped jobs selected by the plan.

## CI

The fork runs `Checks` and `Build Windows x64` for pull requests to `main`.
Checks runs the full validation gate, fork invariants, and migration protection.
The Windows workflow builds and inspects the package, then exercises the retained
Electron workflows with isolated profiles. Publishing requires an explicit workflow
dispatch on a `main` commit whose Checks run has succeeded.

The local planner remains available for scope inspection. It does not control the
fork's CI jobs. See [the fork release guide](../../docs/contrib/fork-release.md).
