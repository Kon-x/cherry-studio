import type { ISeeder } from '../types'
import { BuiltinMcpServerSeeder } from './seeders/builtinMcpServerSeeder'
import { CherryAiDefaultModelSeeder } from './seeders/cherryaiDefaultModelSeeder'
import { DefaultAssistantSeeder } from './seeders/defaultAssistantSeeder'
import { KnowledgeBaseOrderSeeder } from './seeders/knowledgeBaseOrderSeeder'
import { LegacyFileCleanupPolicySeeder } from './seeders/legacyFileCleanupPolicySeeder'
import { LocalModelSeeder } from './seeders/LocalModelSeeder'
import { LongTextPastePreferenceUpgradeSeeder } from './seeders/longTextPastePreferenceUpgradeSeeder'
import { MessageNavigationUpgradeSeeder } from './seeders/MessageNavigationUpgradeSeeder'
import { PoeChatEndpointUpgradeSeeder } from './seeders/PoeChatEndpointUpgradeSeeder'
import { PreferenceSeeder } from './seeders/preferenceSeeder'
import { PresetProviderSeeder } from './seeders/presetProviderSeeder'
import { SelectionActionItemsUpgradeSeeder } from './seeders/selectionActionItemsUpgradeSeeder'
import { SidebarShortcutMigrationSeeder } from './seeders/sidebarShortcutMigrationSeeder'
import { TranslateLanguageSeeder } from './seeders/translateLanguageSeeder'
import { WebSearchPreferenceUpgradeSeeder } from './seeders/WebSearchPreferenceUpgradeSeeder'

/**
 * All seeders in execution order.
 *
 * Keep CherryAiDefaultModelSeeder before DefaultAssistantSeeder because the
 * seeded assistant references the CherryAI default model (FK to user_model).
 *
 * To add a new seeder: create an ISeeder class, add it to this array.
 * No changes to DbService needed.
 */
export const seeders: ISeeder[] = [
  new LegacyFileCleanupPolicySeeder(),
  new PresetProviderSeeder(),
  new KnowledgeBaseOrderSeeder(),
  new PoeChatEndpointUpgradeSeeder(),
  new CherryAiDefaultModelSeeder(),
  new DefaultAssistantSeeder(),
  new LongTextPastePreferenceUpgradeSeeder(),
  new WebSearchPreferenceUpgradeSeeder(),
  new SidebarShortcutMigrationSeeder(),
  new SelectionActionItemsUpgradeSeeder(),
  new MessageNavigationUpgradeSeeder(),
  new PreferenceSeeder(),
  new TranslateLanguageSeeder(),
  new LocalModelSeeder(),
  new BuiltinMcpServerSeeder()
]
