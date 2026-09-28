import { describe, expect, it } from 'vitest'

import { getOrderedLaunchpadApps, normalizeSidebarShortcutItems } from '../sidebar'

describe('retired feature navigation', () => {
  const favorites = [
    { type: 'app', id: 'agents' },
    { type: 'assistant', id: 'custom-assistant' },
    { type: 'mini_app', id: 'old-app' },
    { type: 'app', id: 'notes' },
    { type: 'agent', id: 'old-agent' },
    { type: 'app', id: 'code_tools' },
    { type: 'app', id: 'mini_app' },
    { type: 'app', id: 'assistants' }
  ]

  it('migrates supported favorites in order and drops retired navigation targets', () => {
    expect(normalizeSidebarShortcutItems(favorites).map((item) => item.target.locator)).toEqual([
      { providerId: 'core.assistant', resourceId: 'custom-assistant' },
      { providerId: 'core.app', resourceId: 'notes' },
      { providerId: 'core.app', resourceId: 'assistants' }
    ])
  })

  it('restores exactly the six supported launchpad apps without reordering surviving entries', () => {
    expect(getOrderedLaunchpadApps(['code_tools', 'notes', 'agents', 'files', 'mini_app', 'dsh', 'notes'])).toEqual([
      'notes',
      'files',
      'assistants',
      'paintings',
      'translate',
      'knowledge'
    ])
  })
})
