export function buildBillingProxyHeaders(req, body = {}) {
  const headers = {}
  const language = req?.headers?.['accept-language']
  if (language) headers['Accept-Language'] = language

  const returnUrl = typeof body.return_url === 'string' ? body.return_url.trim() : ''
  const referer = returnUrl || req?.headers?.referer || ''
  if (referer) headers.Referer = referer

  return headers
}
