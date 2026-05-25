import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyOrientation,
  dataUrlByteSize,
  formatBytes,
  formatDate,
  formatDimensions,
  getFormatFromUrl,
  getImageMeta,
  getSize,
  isImageFile,
  readFileAsDataURL,
  referenceImageByteSize,
  truncatePrompt,
} from '../src/utils/image.js'

test('maps aspect ratio and resolution to provider size strings', () => {
  assert.equal(getSize('1:1', '1080p'), '1024x1024')
  assert.equal(getSize('9:16', '4k'), '2160x3840')
  assert.equal(getSize('', 'auto'), '')
  assert.equal(getSize('unknown', '1080p'), '')
})

test('formats image metadata for compact UI display', () => {
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(1536), '1.5 KB')
  assert.equal(formatBytes(2 * 1024 * 1024), '2.00 MB')
  assert.equal(formatBytes(0), '')
  assert.equal(formatDimensions(1024, 768), '1024×768')
  assert.equal(formatDimensions(0, 768), '')
})

test('detects image format from content type before URL extension', () => {
  assert.equal(getFormatFromUrl('https://example.test/file.jpeg?x=1', 'image/webp'), 'webp')
  assert.equal(getFormatFromUrl('https://example.test/file.jpeg?x=1'), 'jpg')
  assert.equal(getFormatFromUrl('https://example.test/no-extension'), 'image')
})

test('truncates prompt previews without preserving noisy whitespace', () => {
  assert.equal(truncatePrompt('  a   clean   product prompt  ', 100), 'a clean product prompt')
  assert.equal(truncatePrompt('abcdefghijklmnopqrstuvwxyz', 10), 'abcdefghij…')
  assert.equal(typeof truncatePrompt('   '), 'string')
})

test('formats valid dates and rejects invalid dates', () => {
  assert.equal(formatDate('not-a-date'), '')
  assert.match(formatDate('2026-05-26T12:34:00.000Z'), /\d{2}/)
})

test('classifies orientation from aspect ratio or explicit size', () => {
  assert.equal(classifyOrientation('1:1'), 'square')
  assert.equal(classifyOrientation('16:9'), 'landscape')
  assert.equal(classifyOrientation('3:4'), 'portrait')
  assert.equal(classifyOrientation('bad'), 'all')
  assert.equal(classifyOrientation('1:1', '800x600'), 'landscape')
})

test('calculates reference image byte sizes from explicit values or data URLs', () => {
  assert.equal(dataUrlByteSize('data:image/png;base64,aGVsbG8='), 5)
  assert.equal(dataUrlByteSize('not-a-data-url'), 0)
  assert.equal(referenceImageByteSize({ byteSize: 123, dataUrl: 'data:image/png;base64,aGVsbG8=' }), 123)
  assert.equal(referenceImageByteSize({ dataUrl: 'data:image/png;base64,aGVsbG8=' }), 5)
  assert.equal(referenceImageByteSize(null), 0)
})

test('loads image metadata with browser image and HEAD probes', async () => {
  const previousFetch = globalThis.fetch
  const previousImage = globalThis.Image
  globalThis.fetch = async () => new Response(null, {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '1234' },
  })
  globalThis.Image = class {
    set src(value) {
      this.naturalWidth = value.includes('wide') ? 1600 : 800
      this.naturalHeight = 900
      queueMicrotask(() => this.onload())
    }
  }

  try {
    assert.deepEqual(await getImageMeta('https://cdn.example.test/wide.jpeg'), {
      width: 1600,
      height: 900,
      size: 1234,
      format: 'jpg',
    })
    assert.deepEqual(await getImageMeta(''), {})
  } finally {
    globalThis.fetch = previousFetch
    globalThis.Image = previousImage
  }
})

test('reads files as data URLs through FileReader', async () => {
  const previousFileReader = globalThis.FileReader
  globalThis.FileReader = class {
    readAsDataURL(file) {
      this.result = `data:${file.type};base64,aGVsbG8=`
      queueMicrotask(() => this.onload())
    }
  }

  try {
    assert.equal(await readFileAsDataURL({ type: 'image/png' }), 'data:image/png;base64,aGVsbG8=')
  } finally {
    globalThis.FileReader = previousFileReader
  }
})

test('accepts image files by MIME type or known image extension', () => {
  assert.equal(isImageFile({ type: 'image/png', name: 'upload.bin' }), true)
  assert.equal(isImageFile({ type: '', name: 'product.WEBP' }), true)
  assert.equal(isImageFile({ type: 'application/json', name: 'product.json' }), false)
})
