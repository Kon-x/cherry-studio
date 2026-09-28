import type { LucideIcon } from 'lucide-react'
import { FileSearch, Folder, Languages, MessageSquare, NotepadText, Palette } from 'lucide-react'

import type { SidebarAppId } from '@renderer/utils/sidebar'

/**
 * Icon component for each built-in sidebar app. Keyed by the `SidebarAppId` union so the
 * compiler enforces full coverage — adding a new sidebar app id without an icon
 * here is a type error. Kept in the component layer because the values are React
 * components; the navigation data and logic live in `@renderer/utils/sidebar`.
 */
export const SIDEBAR_ICON_COMPONENTS = {
  assistants: MessageSquare,
  paintings: Palette,
  translate: Languages,
  knowledge: FileSearch,
  files: Folder,
  notes: NotepadText
} satisfies Record<SidebarAppId, LucideIcon>
