# Regression controller

This directory owns the CI controller for the [Playwright regression scenarios](../../../tests/e2e/regression/README.md).
It controls only the application recorded in its isolated run directory; it never discovers or stops a developer's Electron instance.

## Responsibilities

| Module | Responsibility |
| --- | --- |
| `cases.ts` | Case IDs, titles, task tags, phases, required capabilities, and selection |
| `cli.ts`, `phases.ts` | CLI entry points and one Playwright invocation per selected phase |
| `installation.ts`, `artifacts.ts` | Release installation, asset selection, and hashing |
| `lifecycle.ts` | Start, reuse, restart, and stop the owned application |
| `process.ts` | OS process identity, ancestry, ports, and termination |
| `debugBridge.ts`, `cdpClient.ts` | Explicit main-process debug operations and HTTP callback delivery |
| `systemAutomation.ts` | Native dialogs, external text selection, and keyboard input |
| `RegressionReporter.ts` | Playwright result adapter and run-state updates |
| `state.ts`, `report.ts` | Run state, platform/aggregate verdicts, and human-readable reports |
| `fixtureFiles.ts`, `paths.ts`, `config.ts` | Input fixtures, run-owned paths, and configuration |

Dependencies flow from CLI and E2E fixtures into these modules. The controller does not import E2E scenarios or production services.
The debug bridge may inspect the owned main process; it must never manufacture a successful product result.
The explicit profile/restart operation prepares Windows connections by closing non-main windows before CDP attaches; simply locating a window does not perform this preparation. Both branch and installer launches enable the main-process inspector for this explicit compatibility step.

## Execution contract

Branch runs prepare `rebuild:electron` and `build:utility-process` once after installing
application dependencies. The controller then launches the development server directly,
including on profile switches and persistence-test restarts. Local controller runs must
perform the same preparation in the target checkout before `launch`; release installers
do not need it. Restarting still stops the owned application and preserves its profile.

`cases.ts` is the execution manifest for retained fork features. Run phases sequentially through the CLI; the fork CI release gate remains the Windows smoke suite.

`run.json` schema version 2 records both cases and phases. The parent marks a phase running before starting Playwright; the reporter records test results and executor errors; a nonzero child exit also fails the phase.
A phase left pending/running becomes blocked during finalization. Passing cases cannot hide a failed or unfinished phase. Missing platform reports block the aggregate gate.
Only one phase writes a platform's run state at a time; keep `workers: 1` and sequential CLI invocations.
Each platform keeps its own isolated run directory.
Test names and generated report text use English. External errors and captured application content remain unchanged.

Capability requirements belong to cases. Missing required capabilities skip execution with an explicit reason and are recorded as blocked, never passed.
Capability probes are preflight checks, not evidence that a product interaction succeeded.

## Verification

- `pnpm exec vitest run --project scripts scripts/e2e/regression`
- `pnpm typecheck:e2e`
- `CHERRY_TEST_RUN_DIR=/tmp/cherry-regression-list pnpm test:e2e:regression --list`
- `pnpm lint` and `pnpm docs:check`

Enumeration does not launch Electron or require an initialized run. Enumeration and controller tests do not establish desktop acceptance.
