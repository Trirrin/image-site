import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBillingProxyHeaders } from './payment-return.js'

test('uses the payment return URL as sub2api referer for host validation', () => {
  const headers = buildBillingProxyHeaders(
    { headers: { 'accept-language': 'en-US', referer: 'https://image.example.com/current' } },
    { return_url: 'https://image.example.com/payment/result' }
  )

  assert.deepEqual(headers, {
    'Accept-Language': 'en-US',
    Referer: 'https://image.example.com/payment/result',
  })
})

test('falls back to the original browser referer when no return URL is present', () => {
  const headers = buildBillingProxyHeaders(
    { headers: { referer: 'https://image.example.com/current' } },
    {}
  )

  assert.deepEqual(headers, { Referer: 'https://image.example.com/current' })
})
