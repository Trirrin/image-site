import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPaymentReturnUrl } from './paymentReturn.js'

test('builds the canonical payment return URL required by sub2api', () => {
  assert.equal(buildPaymentReturnUrl('https://image.example.com'), 'https://image.example.com/payment/result')
  assert.equal(buildPaymentReturnUrl('https://image.example.com/app/current?x=1'), 'https://image.example.com/payment/result')
})
