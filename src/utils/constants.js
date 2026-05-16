export const MAX_REFERENCE_IMAGES = 8

export const ASPECT_RATIOS = [
  { value: '', label: 'Auto' },
  { value: '1:1', label: '1:1 (正方形)' },
  { value: '3:2', label: '3:2 (横版)' },
  { value: '16:9', label: '16:9 (横版)' },
  { value: '21:9', label: '21:9 (超宽横版)' },
  { value: '4:3', label: '4:3 (横版)' },
  { value: '3:4', label: '3:4 (竖版)' },
  { value: '9:16', label: '9:16 (竖版)' },
]

export const RESOLUTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '1080p', label: '1080P' },
  { value: '2k', label: '2K' },
]

export const QUALITY_OPTIONS = [
  { value: 'low', label: 'Low', description: '低质量，速度更快，适合草稿测试' },
  { value: 'medium', label: 'Medium', description: '均衡质量与速度，适合日常生成' },
  { value: 'high', label: 'High', description: '高质量，耗时更长，适合最终出图' },
]

export const IMAGE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8]

export const SIZE_MAP = {
  '1:1': { '1080p': '1024x1024', '2k': '2048x2048' },
  '3:2': { '1080p': '1632x1088', '2k': '2160x1440' },
  '16:9': { '1080p': '1920x1088', '2k': '2560x1440' },
  '21:9': { '1080p': '2528x1088', '2k': '3360x1440' },
  '4:3': { '1080p': '1440x1088', '2k': '2048x1536' },
  '3:4': { '1080p': '1088x1440', '2k': '1536x2048' },
  '9:16': { '1080p': '1088x1920', '2k': '1440x2560' },
}

export const IMAGE_EXT_REGEX = /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|svg|webp)$/i

export const PROMPT_MARKET_GITHUB = 'https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/prompts.json'
