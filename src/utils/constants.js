export const MAX_REFERENCE_IMAGES = 8
export const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_REFERENCE_IMAGE_TOTAL_BYTES = 48 * 1024 * 1024

export const ASPECT_RATIOS = [
  { value: '', label: '自动' },
  { value: '1:1', label: '1:1 (正方形)' },
  { value: '3:2', label: '3:2 (横版)' },
  { value: '16:9', label: '16:9 (横版)' },
  { value: '21:9', label: '21:9 (超宽横版)' },
  { value: '4:3', label: '4:3 (横版)' },
  { value: '3:4', label: '3:4 (竖版)' },
  { value: '9:16', label: '9:16 (竖版)' },
]

export const RESOLUTIONS = [
  { value: 'auto', label: '自动' },
  { value: '1080p', label: '1080P' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
]

export const QUALITY_OPTIONS = [
  { value: 'low', label: '低', description: '低质量，速度更快，适合草稿测试' },
  { value: 'medium', label: '中', description: '均衡质量与速度，适合日常生成' },
  { value: 'high', label: '高', description: '高质量，耗时更长，适合最终出图' },
]

export const IMAGE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8]

export const OPTIMIZER_MODEL_REGEX = /^gpt-\d+\.\d+$/i
export const IMAGE_MODEL_REGEX = /^gpt-image/i

export const SIZE_MAP = {
  '1:1': { '1080p': '1024x1024', '2k': '2048x2048', '4k': '4096x4096' },
  '3:2': { '1080p': '1632x1088', '2k': '2160x1440', '4k': '3264x2176' },
  '16:9': { '1080p': '1920x1088', '2k': '2560x1440', '4k': '3840x2160' },
  '21:9': { '1080p': '2528x1088', '2k': '3360x1440', '4k': '5040x2160' },
  '4:3': { '1080p': '1440x1088', '2k': '2048x1536', '4k': '2880x2160' },
  '3:4': { '1080p': '1088x1440', '2k': '1536x2048', '4k': '2160x2880' },
  '9:16': { '1080p': '1088x1920', '2k': '1440x2560', '4k': '2160x3840' },
}

export const IMAGE_EXT_REGEX = /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|svg|webp)$/i

export const PROMPT_MARKET_GITHUB = 'https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/prompts.json'
