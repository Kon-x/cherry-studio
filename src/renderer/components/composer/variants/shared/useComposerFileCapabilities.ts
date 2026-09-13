import { isAudioModel, isAudioModels, isVideoModel, isVideoModels } from '@renderer/utils/model'
import type { Model } from '@shared/data/types/model'
import { audioExts, documentExts, imageExts, textExts, videoExts } from '@shared/utils/file'
import { useMemo } from 'react'

export interface ComposerFileCapabilities {
  canAddImageFile: boolean
  canAddTextFile: boolean
  supportedExts: string[]
}

interface ComposerFileCapabilitiesArgs {
  /** Mentioned models — audio/video support requires ALL of them to qualify. */
  models: Model[]
  /** Model used when no models are mentioned (the assistant model). */
  fallbackModel: Model | undefined
}

// audio/video are the only modalities the chat surface still gates on (images always work
// via the OCR fallback, documents/text always extract). Each maps to the predicate pair
// that probes whether the active model set supports it (single model vs. every mentioned).
const MEDIA_INPUT_PREDICATES = {
  audio: [isAudioModel, isAudioModels],
  video: [isVideoModel, isVideoModels]
} as const satisfies Record<string, readonly [(model: Model) => boolean, (models: Model[]) => boolean]>

/** Images and text can use extraction; audio/video require support from every active model. */
export function useComposerFileCapabilities({
  models,
  fallbackModel
}: ComposerFileCapabilitiesArgs): ComposerFileCapabilities {
  return useMemo(() => {
    const supports = ([single, plural]: (typeof MEDIA_INPUT_PREDICATES)[keyof typeof MEDIA_INPUT_PREDICATES]) =>
      models.length > 0 ? plural(models) : fallbackModel ? single(fallbackModel) : false
    const audio = supports(MEDIA_INPUT_PREDICATES.audio)
    const video = supports(MEDIA_INPUT_PREDICATES.video)
    return {
      canAddImageFile: true,
      canAddTextFile: true,
      supportedExts: [
        ...imageExts,
        ...(audio ? audioExts : []),
        ...(video ? videoExts : []),
        ...documentExts,
        ...textExts
      ]
    }
  }, [models, fallbackModel])
}
