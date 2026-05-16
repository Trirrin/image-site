import { json } from './_shared.js'

export function onRequest() {
  return json({ ok: true })
}
