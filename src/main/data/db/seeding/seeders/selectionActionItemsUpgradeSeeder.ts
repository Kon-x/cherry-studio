import { and, eq } from 'drizzle-orm'

import { preferenceTable } from '@data/db/schemas/preference'
import { SELECTION_ACTION_RUNNER, type SelectionActionItem } from '@shared/data/preference/preferenceTypes'

import type { DbType, ISeeder } from '../../types'
import { hashObject } from '../hashObject'

export class SelectionActionItemsUpgradeSeeder implements ISeeder {
  readonly name = 'selectionActionItemsUpgrade'
  readonly description = 'Preserve legacy selection actions with explicit runners'
  readonly version = hashObject(SELECTION_ACTION_RUNNER)

  run(db: DbType): void {
    const isActionItems = and(
      eq(preferenceTable.scope, 'default'),
      eq(preferenceTable.key, 'feature.selection.action_items')
    )
    const row = db.select({ value: preferenceTable.value }).from(preferenceTable).where(isActionItems).get()
    if (!row || !Array.isArray(row.value)) return

    const items = (row.value as unknown[])
      // An entry that is not an object holds no action, and reading its fields would fail every launch.
      .filter((item): item is SelectionActionItem => typeof item === 'object' && item !== null)
      .map((item) =>
        item.isBuiltIn || item.runner
          ? item
          : { ...item, runner: item.assistantId ? SELECTION_ACTION_RUNNER.ASSISTANT : SELECTION_ACTION_RUNNER.DEFAULT }
      )
    db.update(preferenceTable).set({ value: items }).where(isActionItems).run()
  }
}
