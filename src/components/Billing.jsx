import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, Loader2, ReceiptText, RefreshCw } from 'lucide-react'
import {
  createPaymentOrder,
  fetchCheckoutInfo,
  fetchMyPaymentOrders,
  fetchSubscriptionSummary,
  verifyPaymentOrder,
} from '../api/backend'
import Drawer from './Drawer'

const METHOD_LABELS = {
  alipay: 'Alipay',
  wxpay: 'WeChat Pay',
  alipay_direct: 'Alipay',
  wxpay_direct: 'WeChat Pay',
  stripe: 'Stripe',
  easypay: 'EasyPay',
  airwallex: 'Airwallex',
}

const TERMINAL_STATUSES = new Set(['COMPLETED', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'])

export default function Billing({ open, onClose, onPaymentComplete }) {
  const [checkout, setCheckout] = useState(null)
  const [summary, setSummary] = useState(null)
  const [orders, setOrders] = useState([])
  const [selectedPlanId, setSelectedPlanId] = useState(null)
  const [selectedMethod, setSelectedMethod] = useState('')
  const [orderResult, setOrderResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  const methods = useMemo(() => availableMethods(checkout?.methods), [checkout])
  const plans = Array.isArray(checkout?.plans) ? checkout.plans : []
  const selectedPlan = plans.find((plan) => Number(plan.id) === Number(selectedPlanId)) || null

  const load = useCallback(async () => {
    if (!open) return
    setLoading(true)
    setError('')
    try {
      const [checkoutInfo, subSummary, orderPage] = await Promise.all([
        fetchCheckoutInfo(),
        fetchSubscriptionSummary().catch(() => null),
        fetchMyPaymentOrders({ page: 1, page_size: 6, order_type: 'subscription' }).catch(() => null),
      ])
      setCheckout(checkoutInfo)
      setSummary(subSummary)
      setOrders(normalizeOrders(orderPage))
      const nextMethods = availableMethods(checkoutInfo?.methods)
      setSelectedMethod((current) => current || nextMethods[0]?.key || '')
      setSelectedPlanId((current) => current || checkoutInfo?.plans?.[0]?.id || null)
    } catch (err) {
      setError(err.message || 'Failed to load billing data')
    } finally {
      setLoading(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const timer = window.setTimeout(() => { load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load, open])

  async function handleCreateOrder() {
    if (!selectedPlan) {
      setError('Select a plan first')
      return
    }
    if (!selectedMethod) {
      setError('Select a payment method first')
      return
    }
    setCreating(true)
    setError('')
    try {
      const result = await createPaymentOrder({
        planId: selectedPlan.id,
        amount: selectedPlan.price,
        paymentType: selectedMethod,
        returnUrl: window.location.href,
        isMobile: window.matchMedia?.('(max-width: 768px)').matches || false,
      })
      setOrderResult(result)
      if (result?.pay_url) window.open(result.pay_url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err.message || 'Failed to create order')
    } finally {
      setCreating(false)
    }
  }

  async function handleVerifyOrder() {
    if (!orderResult?.out_trade_no) return
    setVerifying(true)
    setError('')
    try {
      const order = await verifyPaymentOrder(orderResult.out_trade_no)
      setOrderResult((current) => ({ ...current, ...order }))
      if (TERMINAL_STATUSES.has(order?.status)) {
        await load()
        if (order.status === 'COMPLETED' || order.status === 'PAID') onPaymentComplete?.()
      }
    } catch (err) {
      setError(err.message || 'Failed to verify order')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Subscription" description="Plans and payment are served by sub2api">
      <div className="space-y-s-5">
        <div className="flex items-center justify-between gap-s-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-primary">Active subscriptions</p>
            <p className="mt-s-1 text-xs text-ink-muted">{summary?.active_count ?? 0} active</p>
          </div>
          <button
            className="grid h-9 w-9 place-items-center rounded-input border border-border-subtle bg-surface-02 text-ink-muted transition hover:bg-surface-03 hover:text-ink-primary disabled:opacity-60"
            disabled={loading}
            onClick={load}
            type="button"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-s-2 rounded-input border border-danger/30 bg-danger/10 px-s-3 py-s-2 text-sm text-danger">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !checkout ? (
          <div className="grid min-h-40 place-items-center rounded-card border border-border-subtle bg-surface-02 text-ink-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <>
            <section className="space-y-s-3">
              <div className="flex items-center gap-s-2 text-sm font-semibold text-ink-primary">
                <CreditCard size={15} />
                Plans
              </div>
              <div className="grid gap-s-3">
                {plans.length === 0 ? (
                  <p className="rounded-input border border-border-subtle bg-surface-02 px-s-3 py-s-3 text-sm text-ink-muted">No plans available</p>
                ) : plans.map((plan) => (
                  <button
                    key={plan.id}
                    className={`w-full rounded-card border p-s-4 text-left transition ${Number(selectedPlanId) === Number(plan.id) ? 'border-accent bg-accent-wash' : 'border-border-subtle bg-surface-02 hover:border-border-strong'}`}
                    onClick={() => setSelectedPlanId(plan.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-s-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-primary">{plan.name}</p>
                        <p className="mt-s-1 text-xs text-ink-muted">{plan.group_name || plan.description || 'Subscription plan'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-semibold text-ink-primary">{formatMoney(plan.price)}</p>
                        <p className="text-[11px] text-ink-faint">{formatValidity(plan)}</p>
                      </div>
                    </div>
                    {Array.isArray(plan.features) && plan.features.length > 0 && (
                      <div className="mt-s-3 flex flex-wrap gap-s-2">
                        {plan.features.slice(0, 4).map((feature) => (
                          <span key={feature} className="rounded-pill border border-border-subtle bg-surface-01 px-s-2 py-1 text-[11px] text-ink-secondary">{feature}</span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-s-3">
              <div className="flex items-center gap-s-2 text-sm font-semibold text-ink-primary">
                <ReceiptText size={15} />
                Payment method
              </div>
              <div className="grid grid-cols-2 gap-s-2">
                {methods.length === 0 ? (
                  <p className="col-span-2 rounded-input border border-border-subtle bg-surface-02 px-s-3 py-s-3 text-sm text-ink-muted">No payment methods available</p>
                ) : methods.map((method) => (
                  <button
                    key={method.key}
                    className={`rounded-input border px-s-3 py-s-2 text-sm font-medium transition ${selectedMethod === method.key ? 'border-accent bg-accent text-ink-base-l' : 'border-border-subtle bg-surface-02 text-ink-secondary hover:bg-surface-03'}`}
                    onClick={() => setSelectedMethod(method.key)}
                    type="button"
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </section>

            <button
              className="inline-flex h-11 w-full items-center justify-center gap-s-2 rounded-input bg-accent px-s-4 text-sm font-semibold text-ink-base-l transition hover:bg-accent-soft disabled:opacity-60"
              disabled={creating || !selectedPlan || !selectedMethod}
              onClick={handleCreateOrder}
              type="button"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
              Create order
            </button>

            {orderResult && (
              <section className="rounded-card border border-border-subtle bg-surface-02 p-s-4">
                <div className="flex items-start justify-between gap-s-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-primary">Order #{orderResult.order_id}</p>
                    <p className="mt-s-1 text-xs text-ink-muted">{orderResult.status || 'PENDING'} · {formatMoney(orderResult.pay_amount ?? orderResult.amount)}</p>
                  </div>
                  {(orderResult.status === 'COMPLETED' || orderResult.status === 'PAID') && <CheckCircle2 size={18} className="text-success" />}
                </div>

                {orderResult.qr_code && (
                  <div className="mt-s-3 rounded-input border border-border-subtle bg-surface-01 p-s-3">
                    {isImageSource(orderResult.qr_code) ? (
                      <img className="mx-auto h-44 w-44 rounded-input bg-white object-contain p-s-2" src={orderResult.qr_code} alt="Payment QR code" />
                    ) : (
                      <p className="break-all font-mono text-xs text-ink-muted">{orderResult.qr_code}</p>
                    )}
                  </div>
                )}

                <div className="mt-s-3 flex flex-wrap gap-s-2">
                  {orderResult.pay_url && (
                    <a
                      className="inline-flex h-9 items-center gap-s-2 rounded-input border border-border-subtle bg-surface-01 px-s-3 text-sm font-medium text-ink-secondary hover:bg-surface-03"
                      href={orderResult.pay_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink size={14} />
                      Open payment
                    </a>
                  )}
                  {orderResult.out_trade_no && (
                    <button
                      className="inline-flex h-9 items-center gap-s-2 rounded-input border border-border-subtle bg-surface-01 px-s-3 text-sm font-medium text-ink-secondary hover:bg-surface-03 disabled:opacity-60"
                      disabled={verifying}
                      onClick={handleVerifyOrder}
                      type="button"
                    >
                      {verifying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Verify
                    </button>
                  )}
                </div>
              </section>
            )}

            {orders.length > 0 && (
              <section className="space-y-s-2">
                <p className="text-sm font-semibold text-ink-primary">Recent orders</p>
                <div className="space-y-s-2">
                  {orders.map((order) => (
                    <div key={order.id || order.out_trade_no} className="flex items-center justify-between gap-s-3 rounded-input border border-border-subtle bg-surface-02 px-s-3 py-s-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink-primary">{order.out_trade_no || `#${order.id}`}</p>
                        <p className="text-xs text-ink-muted">{formatDate(order.created_at)} · {order.status}</p>
                      </div>
                      <p className="shrink-0 text-sm font-medium text-ink-secondary">{formatMoney(order.pay_amount ?? order.amount)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Drawer>
  )
}

function availableMethods(methods) {
  if (!methods || typeof methods !== 'object') return []
  return Object.entries(methods)
    .filter(([, limit]) => limit?.available !== false)
    .map(([key]) => ({ key, label: METHOD_LABELS[key] || key }))
}

function normalizeOrders(page) {
  if (Array.isArray(page)) return page
  if (Array.isArray(page?.items)) return page.items
  if (Array.isArray(page?.data?.items)) return page.data.items
  return []
}

function formatMoney(value) {
  const amount = Number(value || 0)
  return `¥${amount.toFixed(2)}`
}

function formatValidity(plan) {
  const days = Number(plan?.validity_days || 0)
  const unit = plan?.validity_unit || 'day'
  return days > 0 ? `${days} ${unit}` : 'subscription'
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString()
}

function isImageSource(value) {
  return typeof value === 'string' && /^(https?:|data:image\/)/i.test(value)
}
