export function buildPaymentReturnUrl(origin) {
  return new URL('/payment/result', origin).toString()
}
