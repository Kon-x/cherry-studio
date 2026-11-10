import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DataApiErrorFactory, ErrorCode } from '@shared/data/api/errors'
import { IpcError, IpcErrorCode } from '@shared/ipc/errors/IpcError'
import { isTrashTopicPinnedError, trashErrorCodes } from '@shared/ipc/errors/trash'

const { appGetMock } = vi.hoisted(() => ({ appGetMock: vi.fn() }))
vi.mock('@application', () => ({ application: { get: appGetMock } }))
vi.mock('@data/services/FileEntryService', () => ({ fileEntryService: {} }))
vi.mock('@data/services/MessageService', () => ({ messageService: {} }))
vi.mock('@main/services/file', () => ({ openRequestPath: vi.fn() }))
import { trashHandlers } from '../trash'

const trashService = { deleteActiveTopicsPermanently: vi.fn() }
const ctx = { senderId: 'w1' }

beforeEach(() => {
  vi.clearAllMocks()
  appGetMock.mockImplementation((name: string) => {
    if (name === 'TrashService') return trashService
    throw new Error(`Unexpected application.get(${name})`)
  })
})

describe('pinned deletion IPC mapping', () => {
  it('maps only a pinned topic refusal onto TRASH_TOPIC_PINNED', async () => {
    const pinned = DataApiErrorFactory.invalidOperation('delete pinned topic', 'topic-a')
    trashService.deleteActiveTopicsPermanently.mockRejectedValueOnce(pinned)

    const error = await trashHandlers['trash.topic.delete_permanently']({ topicIds: ['topic-a'] }, ctx).catch(
      (caught) => caught
    )

    expect(isTrashTopicPinnedError(error)).toBe(true)
    expect(error).toMatchObject({ code: trashErrorCodes.TRASH_TOPIC_PINNED, message: pinned.message })
    expect(IpcError.from(error).toJSON()).toEqual({ code: trashErrorCodes.TRASH_TOPIC_PINNED, message: pinned.message })

    const other = DataApiErrorFactory.invalidOperation('move message', 'would create cycle')
    trashService.deleteActiveTopicsPermanently.mockRejectedValueOnce(other)
    const preserved = await trashHandlers['trash.topic.delete_permanently']({ topicIds: ['topic-a'] }, ctx).catch(
      (caught) => caught
    )

    expect(preserved).toMatchObject({ code: ErrorCode.INVALID_OPERATION, details: other.details })
    expect(isTrashTopicPinnedError(preserved)).toBe(false)
    expect(IpcError.from(preserved).code).toBe(IpcErrorCode.INTERNAL)
  })
})
