import { useState } from 'react'

export default function FallbackImage({ image, src, fallbackSrc, onError, ...props }) {
  const primary = src || image?.url || ''
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
