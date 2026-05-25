import { useMemo } from 'react'
import { Image, MessageCircle, CheckCircle, AlertTriangle, Cpu, TrendingUp } from 'lucide-react'
import Sparkline from './Sparkline'

function computeStats(conversations) {
  let totalImages = 0
  let totalTurns = 0
  let successTurns = 0
  let errorTurns = 0
  const modelCounts = {}
  const dailyBuckets = {}

  for (const conv of conversations) {
    for (const turn of conv.turns || []) {
      totalTurns += 1
      if (turn.status === 'success') {
        successTurns += 1
        totalImages += (turn.images || []).length
      }
      if (turn.status === 'error') errorTurns += 1
      if (turn.model) modelCounts[turn.model] = (modelCounts[turn.model] || 0) + 1
      const day = (turn.createdAt || '').slice(0, 10)
      if (day) dailyBuckets[day] = (dailyBuckets[day] || 0) + (turn.status === 'success' ? (turn.images || []).length : 0)
    }
  }

  const successRate = totalTurns > 0 ? Math.round((successTurns / totalTurns) * 100) : 0
  const topModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-'

  const days = Object.keys(dailyBuckets).sort()
  const last7Days = []
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    last7Days.push(dailyBuckets[key] || 0)
  }

  return {
    totalImages,
    totalConversations: conversations.length,
    totalTurns,
    successTurns,
    errorTurns,
    successRate,
    topModel,
    trend: last7Days,
    trendLabels: days.slice(-7),
  }
}

export default function Dashboard({ conversations }) {
  const stats = useMemo(() => computeStats(conversations), [conversations])

  const cards = [
    { label: '总图片', value: stats.totalImages, icon: Image, color: 'text-accent', bg: 'bg-accent/10' },
    { label: '总会话', value: stats.totalConversations, icon: MessageCircle, color: 'text-info', bg: 'bg-info/10' },
    { label: '成功率', value: `${stats.successRate}%`, icon: stats.successRate >= 80 ? CheckCircle : AlertTriangle, color: stats.successRate >= 80 ? 'text-success' : 'text-warning', bg: stats.successRate >= 80 ? 'bg-success/10' : 'bg-warning/10' },
    { label: '最常用模型', value: stats.topModel, icon: Cpu, color: 'text-accent-soft', bg: 'bg-accent-soft/10' },
  ]

  return (
    <section className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-s-5 py-s-6">
        <h1 className="font-display text-2xl text-ink-primary">概览</h1>
        <p className="mt-s-1 text-sm text-ink-muted">你的人工智能图像生成统计数据</p>

        <div className="mt-s-6 grid grid-cols-2 gap-s-4 lg:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <article key={card.label} className="rounded-card border border-border-subtle bg-surface-01 p-s-4 transition hover:border-border-strong">
                <div className="flex items-center gap-s-3">
                  <div className={`grid h-10 w-10 place-items-center rounded-std ${card.bg} ${card.color}`}>
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-ink-muted">{card.label}</p>
                    <p className="truncate text-lg font-semibold text-ink-primary">{card.value}</p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <div className="mt-s-6 grid grid-cols-1 gap-s-4 lg:grid-cols-2">
          <article className="rounded-card border border-border-subtle bg-surface-01 p-s-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-primary">近 7 天生成趋势</h2>
              <TrendingUp size={15} className="text-ink-faint" />
            </div>
            <div className="mt-s-4 flex items-end gap-s-2">
              <Sparkline data={stats.trend} width={240} height={48} stroke="var(--color-accent)" />
              <div className="flex-1" />
              <div className="text-right">
                <p className="text-2xl font-bold text-ink-primary">{stats.trend.reduce((a, b) => a + b, 0)}</p>
                <p className="text-[11px] text-ink-muted">7 天总量</p>
              </div>
            </div>
          </article>

          <article className="rounded-card border border-border-subtle bg-surface-01 p-s-5">
            <h2 className="text-sm font-semibold text-ink-primary">生成状态分布</h2>
            <div className="mt-s-4 space-y-s-3">
              <StatBar label="成功" count={stats.successTurns} total={stats.totalTurns || 1} color="bg-success" />
              <StatBar label="失败" count={stats.errorTurns} total={stats.totalTurns || 1} color="bg-danger" />
              <StatBar label="进行中" count={stats.totalTurns - stats.successTurns - stats.errorTurns} total={stats.totalTurns || 1} color="bg-accent" />
            </div>
          </article>
        </div>

        {stats.totalImages === 0 && (
          <div className="mt-s-8 flex flex-col items-center gap-s-3 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-card bg-surface-03 text-accent">
              <Image size={24} />
            </div>
            <p className="text-sm text-ink-muted">还没有生成记录，去创作你的第一张图片吧</p>
          </div>
        )}
      </div>
    </section>
  )
}

function StatBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-s-3">
      <span className="w-14 shrink-0 text-xs text-ink-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-03">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-xs text-ink-secondary">{count} ({pct}%)</span>
    </div>
  )
}
