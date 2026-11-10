import { loggerService } from '@logger'
import type { SelectionActionItem } from '@shared/data/preference/preferenceTypes'
import { type SelectionAction, SelectionActionSchema } from '@shared/types/selection'

const logger = loggerService.withContext('selectionAction')

/** Narrows stored action items; an item that does not parse is skipped so the rest stay usable. */
export function parseSelectionActions(items: readonly SelectionActionItem[]): SelectionAction[] {
  return items.flatMap((item) => {
    const result = SelectionActionSchema.safeParse(item)
    if (result.success) return [result.data]
    logger.warn('Skipping an invalid selection action', { id: item.id, issues: result.error.issues })
    return []
  })
}

/** A custom action's prompt with the selection filled in: `{{text}}` marks its place, otherwise it follows the prompt. */
export function expandSelectionPrompt(prompt: string | undefined, selectedText: string): string {
  if (!prompt) return selectedText
  if (prompt.includes('{{text}}')) return prompt.replaceAll('{{text}}', () => selectedText)
  return prompt + '\n\n' + selectedText
}
