import { useEffect, useState } from 'react'
import { loadImageBlob } from '../storage/conversationStore'

export default function FallbackImage({ image, src, fallbackSrc, onError, ...props }) {
  const [localImage, setLocalImage] = useState({ id: '', url: '' })

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''
    const localImageId = image?.localImageId || ''

    if (!localImageId) return undefined
    loadImageBlob(localImageId).then((blob) => {
      if (cancelled || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setLocalImage({ id: localImageId, url: objectUrl })
    }).catch(() => {})

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [image?.localImageId])

  const localSrc = localImage.id === image?.localImageId ? localImage.url : ''
  const primary = src || localSrc || image?.url || ''
  const fallback = fallbackSrc || image?.sourceUrl || ''
  const sourceKey = `${primary}\n${fallback}`
  const [failedSourceKey, setFailedSourceKey] = useState('')
  const canFallback = fallback && fallback !== primary
  const usingFallback = canFallback && failedSourceKey === sourceKey
  const resolvedSrc = usingFallback ? fallback : primary

  return (
    <img
      {...props}
      src={resolvedSrc}
      onError={(event) => {
        if (!usingFallback && canFallback) {
          setFailedSourceKey(sourceKey)
          return
        }
        onError?.(event)
      }}
    />
  )
}
