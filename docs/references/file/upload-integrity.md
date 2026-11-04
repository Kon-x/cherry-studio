---
description: File intake checksum verification, durable completion, and recovery before managed-file publication
sources:
  - src/main/services/file/FileIntakeService.ts
  - src/main/services/file/intakeTypes.ts
  - src/main/services/file/internal/IntakeStore.ts
  - src/main/services/file/internal/entry/publishIntake.ts
---

# Upload Integrity

`FileIntakeService` owns staged file transfers and publishes verified bytes through
`FileManager`. The fork retains this file service; remote Agent transports are not registered.

## Completion contract

`prepare` fixes the upload identity, owner, filename, size, media type, and optional
`checksumAlgorithm: 'sha256'`. Reusing an identity with different metadata is rejected.
Writes must match the current writer epoch and committed offset. Resuming advances the
epoch so an earlier writer cannot append data.

`complete` requires all declared bytes to be committed. In checksum mode, it also requires
a lowercase 64-character `expectedSha256`; legacy mode rejects that field. Changing an
already recorded expected digest is an idempotency conflict. The service persists the
expected digest before moving from `receiving` to `verifying`.

Verification streams the staged bytes through SHA-256 and compares their actual length
and, in checksum mode, their digest. A mismatch becomes durable `CHECKSUM_MISMATCH` and
never publishes a file entry. Read or publication failures become `VERIFICATION_FAILED`.
A successful verification records a stable entry ID and actual digest before calling
`FileManager.publishIntake`, then exposes `ready` with the published entry.

## Recovery and ownership

Verification runs with two concurrent slots and serializes publication by upload identity.
Before publishing, it checks that the current record is still verifying and has not expired.
Cancellation removes the record from eligibility, so a late verification cannot revive it.

Restart recovery re-reads staged bytes. If publication already moved those bytes, the
recorded entry ID and digest identify the managed candidate; `publishIntake` verifies
that candidate before returning it. Recovery reuses the entry ID instead of creating a
second managed entry. An interrupted completion can be repeated with the same metadata.

Snapshots report committed bytes, writer epoch, expiry, verification state, and any
terminal failure. A transfer at 100% is not ready until verification and publication finish.

## Validation

`src/main/services/file/__tests__/fileIntake.test.ts` covers checksum mismatch without
publication, idempotent completion, ownership and writer fencing, cancellation, restart
rehashing, and publication recovery. These are local file-service contracts; they do not
assert mobile transport or native-device compatibility.
