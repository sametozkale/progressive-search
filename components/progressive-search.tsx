"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, LayoutGroup } from "framer-motion"
import {
  ArrowUpRight,
  ChevronDown,
  CornerDownLeft,
  Filter,
  FilterX,
  Info,
  RotateCcw,
  ScanSearch,
  Search,
  SearchX,
  Sparkles,
  Undo2,
  Users,
  X,
} from "lucide-react"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Kbd } from "@/components/ui/kbd"
import { COMPANIES, type Company, type Tier } from "@/lib/data"
import { cn } from "@/lib/utils"

type RowState = "pending" | "scanning" | "classified" | "discarded" | "restored"

type EvalRow = Company & {
  state: RowState
  classifiedAt?: number
}

type SortKey = "score" | "name" | "employees" | "founded"
type SortDir = "desc" | "asc"

const DEFAULT_PROMPT =
  "AI labs founded by alumni of OpenAI, Anthropic, or DeepMind"

// Approx total to display in the "evaluated of" counter, to suggest scale.
const TOTAL_CANDIDATES = 12_487

export function ProgressiveSearch() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [draft, setDraft] = useState(DEFAULT_PROMPT)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [rows, setRows] = useState<EvalRow[]>(() =>
    COMPANIES.map((c) => ({ ...c, state: "pending" })),
  )
  const [evaluatedCount, setEvaluatedCount] = useState(0)
  const [activeIds, setActiveIds] = useState<string[]>([])
  const [tierFilter, setTierFilter] = useState<Set<Tier>>(
    () => new Set<Tier>(["high", "medium"]),
  )
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "score",
    dir: "desc",
  })
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const timeoutsRef = useRef<number[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const clearTimers = () => {
    timeoutsRef.current.forEach((t) => window.clearTimeout(t))
    timeoutsRef.current = []
  }

  useEffect(() => () => clearTimers(), [])

  const startSearch = (q: string) => {
    clearTimers()
    setPrompt(q)
    setRunning(true)
    setDone(false)
    setEvaluatedCount(0)
    setActiveIds([])
    setShowDiscarded(false)

    const reset: EvalRow[] = COMPANIES.map((c) => ({ ...c, state: "pending" }))
    setRows(reset)

    const order = [...reset]
      .map((r) => ({ r, k: Math.random() }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.r)

    let cursor = 250
    order.forEach((row, idx) => {
      const scanDelay = cursor
      const classifyDelay = cursor + 320 + Math.random() * 220
      cursor = classifyDelay + 90 + Math.random() * 140

      timeoutsRef.current.push(
        window.setTimeout(() => {
          setActiveIds((cur) => [...cur, row.id].slice(-3))
          setRows((cur) =>
            cur.map((r) => (r.id === row.id ? { ...r, state: "scanning" } : r)),
          )
        }, scanDelay),
      )

      timeoutsRef.current.push(
        window.setTimeout(() => {
          setActiveIds((cur) => cur.filter((id) => id !== row.id))
          setRows((cur) =>
            cur.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    state: r.tier === "low" ? "discarded" : "classified",
                    classifiedAt: Date.now(),
                  }
                : r,
            ),
          )
          setEvaluatedCount(() => idx + 1)
        }, classifyDelay),
      )
    })

    timeoutsRef.current.push(
      window.setTimeout(() => {
        setRunning(false)
        setDone(true)
        setActiveIds([])
      }, cursor + 300),
    )
  }

  useEffect(() => {
    const t = window.setTimeout(() => startSearch(DEFAULT_PROMPT), 350)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = () => {
    if (!draft.trim()) return
    startSearch(draft.trim())
  }

  const restoreRow = (id: string) => {
    setRows((cur) =>
      cur.map((r) =>
        r.id === id ? { ...r, state: "restored" as RowState } : r,
      ),
    )
  }

  const toggleTier = (t: Tier) => {
    setTierFilter((cur) => {
      const next = new Set(cur)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0, discarded: 0, surviving: 0 }
    rows.forEach((r) => {
      if (r.state === "discarded") c.discarded++
      if (r.state === "classified" || r.state === "restored") {
        c.surviving++
        c[r.tier]++
      }
    })
    return c
  }, [rows])

  const visibleRows = useMemo(() => {
    const surviving = rows.filter(
      (r) => r.state === "classified" || r.state === "restored",
    )
    const filtered = surviving.filter((r) => tierFilter.has(r.tier))
    const dir = sort.dir === "desc" ? -1 : 1
    return [...filtered].sort((a, b) => {
      let va: number | string = a[sort.key] as number | string
      let vb: number | string = b[sort.key] as number | string
      if (typeof va === "string") va = va.toLowerCase()
      if (typeof vb === "string") vb = vb.toLowerCase()
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }, [rows, tierFilter, sort])

  const discardedRows = useMemo(
    () => rows.filter((r) => r.state === "discarded"),
    [rows],
  )

  const progress = running
    ? Math.min(100, (evaluatedCount / COMPANIES.length) * 100)
    : done
      ? 100
      : 0

  const fakeEvaluated = Math.round(
    (evaluatedCount / COMPANIES.length) * TOTAL_CANDIDATES,
  )

  const activeName =
    activeIds
      .map((id) => rows.find((r) => r.id === id)?.name ?? "")
      .filter(Boolean)
      .slice(-1)[0] ?? null

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  // Global keyboard navigation across the living result set.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA"

      if (e.key === "/" && !typing) {
        e.preventDefault()
        inputRef.current?.focus()
        return
      }
      if (typing) return
      if ((e.key === "Escape" || e.key === "Esc") && selectedId) {
        setSelectedId(null)
        return
      }
      if (!visibleRows.length) return

      const i = visibleRows.findIndex((r) => r.id === selectedId)
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault()
        const next = visibleRows[i < 0 ? 0 : Math.min(visibleRows.length - 1, i + 1)]
        setSelectedId(next.id)
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault()
        const prev = visibleRows[i < 0 ? 0 : Math.max(0, i - 1)]
        setSelectedId(prev.id)
      } else if (e.key === "Enter" && selectedId) {
        const row = visibleRows.find((r) => r.id === selectedId)
        if (row) window.open(`https://${row.domain}`, "_blank", "noopener")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [visibleRows, selectedId])

  // Keep the selected row in view as the user navigates.
  useEffect(() => {
    if (!selectedId) return
    const node = document.querySelector(`[data-row-id="${selectedId}"]`)
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selectedId])

  return (
    <TooltipProvider delayDuration={120}>
    <main className="relative min-h-dvh">
      <BackgroundGrid />

      <div className="relative mx-auto max-w-6xl px-6 pt-12 pb-32 md:px-8">
        <Header />

        {/* Prompt */}
        <section className="mt-8">
          <div
            className={cn(
              "group relative rounded-xl border bg-card shadow-sm transition-colors",
              running ? "border-primary/40" : "border-border",
            )}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                placeholder="Describe what you're looking for…"
                className="flex h-10 flex-1 resize-none items-center bg-transparent py-2.5 text-base leading-6 outline-none placeholder:text-muted-foreground/70"
              />
              <div className="flex shrink-0 items-center gap-2">
                {running ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearTimers()
                      setRunning(false)
                      setDone(true)
                      setActiveIds([])
                    }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-secondary px-3.5 font-mono text-xs text-secondary-foreground transition hover:bg-muted"
                  >
                    <X className="size-3.5" />
                    Stop
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={submit}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 font-mono text-xs font-medium text-primary-foreground transition hover:opacity-90"
                >
                  <Sparkles className="size-3.5" />
                  {running ? "Re-run" : done ? "Run again" : "Run"}
                  <kbd className="ml-1 inline-flex items-center gap-0.5 rounded border border-primary-foreground/25 bg-primary-foreground/10 px-1 py-0.5 text-[10px] leading-none">
                    <CornerDownLeft className="size-2.5" />
                  </kbd>
                </button>
              </div>
            </div>

            {/* Scanline */}
            <div className="relative h-px overflow-hidden bg-border">
              <AnimatePresence>
                {running && (
                  <motion.div
                    key="scan"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 scanline"
                  />
                )}
              </AnimatePresence>
              <div
                className="absolute left-0 top-0 h-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Status bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 font-mono text-[11px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      running
                        ? "bg-primary animate-pulse"
                        : done
                          ? "bg-primary"
                          : "bg-muted-foreground/40",
                    )}
                  />
                  {running ? "evaluating" : done ? "complete" : "idle"}
                </span>
                <span className="hidden sm:inline-block h-3 w-px bg-border" />
                <span>
                  {fakeEvaluated.toLocaleString()} /{" "}
                  {TOTAL_CANDIDATES.toLocaleString()} candidates
                </span>
                {activeIds.length > 0 && (
                  <>
                    <span className="hidden md:inline-block h-3 w-px bg-border" />
                    <span className="hidden md:inline-flex items-center gap-1.5">
                      <span className="text-foreground/70">→</span>
                      <span className="truncate">
                        scanning{" "}
                        {activeIds
                          .map(
                            (id) => rows.find((r) => r.id === id)?.name ?? "",
                          )
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                      <span className="blink">▍</span>
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Counter label="HIGH" value={counts.high} tier="high" />
                <Counter label="MED" value={counts.medium} tier="medium" />
                <Counter
                  label="DROP"
                  value={counts.discarded}
                  tier="low"
                  muted
                />
              </div>
            </div>
          </div>
        </section>

        {/* Toolbar */}
        <section className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 pr-1 font-mono text-[11px] text-muted-foreground">
              <Filter className="size-3" />
              filter
            </span>
            <TierChip
              tier="high"
              active={tierFilter.has("high")}
              count={counts.high}
              onClick={() => toggleTier("high")}
            />
            <TierChip
              tier="medium"
              active={tierFilter.has("medium")}
              count={counts.medium}
              onClick={() => toggleTier("medium")}
            />
          </div>
          <div className="flex items-center gap-2">
            <SortControl sort={sort} onChange={setSort} />
            <button
              type="button"
              onClick={() => startSearch(prompt)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 font-mono text-[11px] text-muted-foreground transition hover:text-foreground hover:bg-secondary"
            >
              <RotateCcw className="size-3.5" />
              re-run
            </button>
          </div>
        </section>

        {/* Results list */}
        <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {/* column header */}
          <div className="grid grid-cols-12 gap-4 border-b border-border bg-secondary/60 px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="col-span-1">tier</div>
            <div className="col-span-4 md:col-span-3">company</div>
            <div className="col-span-7 md:col-span-6">match · reasoning</div>
            <div className="hidden md:col-span-2 md:block text-right">
              meta
            </div>
          </div>

          <LayoutGroup>
            <ul className="divide-y divide-border">
              <AnimatePresence mode="popLayout" initial={false}>
                {visibleRows.map((row) => (
                  <motion.li
                    key={row.id}
                    layout
                    data-row-id={row.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{
                      layout: { type: "spring", stiffness: 400, damping: 36 },
                      opacity: { duration: 0.18 },
                      y: { duration: 0.18 },
                    }}
                    onMouseEnter={() => setHoverId(row.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => setSelectedId(row.id)}
                    className={cn(
                      "group relative grid cursor-default grid-cols-12 gap-4 px-5 py-4 outline-none transition-colors",
                      "hover:bg-secondary/60",
                      selectedId === row.id
                        ? "bg-secondary/80 ring-1 ring-inset ring-primary/50"
                        : hoverId === row.id && "bg-secondary/60",
                    )}
                  >
                    {selectedId === row.id && (
                      <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
                    )}
                    <Row row={row} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </LayoutGroup>

          {/* Empty states */}
          {visibleRows.length === 0 &&
            (running ? (
              <ScanningPlaceholder activeName={activeName} />
            ) : counts.surviving > 0 ? (
              <EmptyState
                icon={FilterX}
                title="No results match your filters"
                body={`${counts.surviving} ${
                  counts.surviving === 1 ? "company is" : "companies are"
                } hidden by the active tier filter.`}
                action={{
                  label: "Show all tiers",
                  onClick: () => setTierFilter(new Set<Tier>(["high", "medium"])),
                }}
              />
            ) : (
              <EmptyState
                icon={SearchX}
                title="No strong matches found"
                body="Nothing cleared the bar for this prompt. Try broadening the criteria or loosening a constraint, then run again."
                action={{
                  label: "Refine prompt",
                  onClick: () => inputRef.current?.focus(),
                }}
              />
            ))}

          {/* Discarded drawer */}
          <DiscardedDrawer
            open={showDiscarded}
            onToggle={() => setShowDiscarded((s) => !s)}
            rows={discardedRows}
            onRestore={restoreRow}
          />
        </section>

        {/* Footer hint */}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-muted-foreground">
          <span className="text-muted-foreground/70">
            refine, sort, or filter mid-pass — results re-rank live.
          </span>
          <span className="flex items-center gap-2">
            <KeyHint keys={["J", "K"]} label="navigate" />
            <KeyHint keys={["↵"]} label="open" />
            <KeyHint keys={["/"]} label="search" />
          </span>
        </div>
      </div>
    </main>
    </TooltipProvider>
  )
}

/* ───────── components ────────── */

function Header() {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        {/* Official Zero brand mark from zero.inc */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/zero-logo-dark.png"
          alt="Zero"
          width={28}
          height={28}
          className="size-7 rounded-lg"
        />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Zero
        </span>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          progressive search
        </span>
      </div>
      <div className="hidden items-center gap-3 font-mono text-[11px] text-muted-foreground md:flex">
        <span>v0.1</span>
        <span className="size-1 rounded-full bg-muted-foreground/40" />
        <span>{TOTAL_CANDIDATES.toLocaleString()} candidates</span>
      </div>
    </header>
  )
}

function BackgroundGrid() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] grid-bg opacity-50" />
  )
}

function KeyHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
      <span className="text-muted-foreground/70">{label}</span>
    </span>
  )
}

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center px-6 py-16 text-center"
    >
      <div className="relative mb-4 flex size-12 items-center justify-center rounded-xl border border-border bg-secondary">
        <span className="absolute inset-0 rounded-xl bg-primary/5" />
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-sm text-pretty text-[13px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 font-mono text-[11px] text-foreground transition hover:bg-secondary"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  )
}

function ScanningPlaceholder({ activeName }: { activeName: string | null }) {
  return (
    <div className="px-5 py-8">
      <div className="flex items-center justify-center gap-2 pb-6 font-mono text-[11px] text-muted-foreground">
        <ScanSearch className="size-3.5 text-primary" />
        <span>
          evaluating candidates
          {activeName ? (
            <>
              {" · "}
              <span className="text-foreground/80">{activeName}</span>
            </>
          ) : null}
        </span>
        <span className="blink text-primary">▍</span>
      </div>
      <ul className="space-y-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex items-center gap-3"
            style={{ opacity: 1 - i * 0.28 }}
          >
            <span className="size-9 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
              <span className="block size-full scanline opacity-40" />
            </span>
            <div className="flex-1 space-y-2">
              <span className="block h-2.5 w-1/3 overflow-hidden rounded bg-secondary">
                <span className="block size-full scanline opacity-40" />
              </span>
              <span className="block h-2 w-2/3 overflow-hidden rounded bg-secondary">
                <span className="block size-full scanline opacity-30" />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Counter({
  label,
  value,
  tier,
  muted,
}: {
  label: string
  value: number
  tier: Tier
  muted?: boolean
}) {
  const color =
    tier === "high"
      ? "text-tier-high"
      : tier === "medium"
        ? "text-tier-medium"
        : "text-muted-foreground"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 tabular-nums",
        muted && "opacity-70",
      )}
    >
      <span className={cn("size-1.5 rounded-full", `bg-current ${color}`)} />
      <span className="text-muted-foreground">{label}</span>
      <motion.span
        key={value}
        initial={{ y: -4, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-foreground"
      >
        {value}
      </motion.span>
    </span>
  )
}

function TierChip({
  tier,
  active,
  count,
  onClick,
}: {
  tier: Tier
  active: boolean
  count: number
  onClick: () => void
}) {
  const styles =
    tier === "high"
      ? {
          dot: "bg-tier-high",
          on: "border-tier-high/20 bg-tier-high/8 text-foreground",
        }
      : tier === "medium"
        ? {
            dot: "bg-tier-medium",
            on: "border-tier-medium/20 bg-tier-medium/8 text-foreground",
          }
        : {
            dot: "bg-muted-foreground",
            on: "border-border bg-secondary text-foreground",
          }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-full border px-3 font-mono text-[11px] transition",
        active
          ? styles.on
          : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary",
      )}
    >
      <span className={cn("size-1.5 rounded-full", styles.dot)} />
      <span className="uppercase tracking-wide">{tier}</span>
      <span className="tabular-nums text-foreground/80">{count}</span>
    </button>
  )
}

function SortControl({
  sort,
  onChange,
}: {
  sort: { key: SortKey; dir: SortDir }
  onChange: (s: { key: SortKey; dir: SortDir }) => void
}) {
  const opts: { key: SortKey; label: string }[] = [
    { key: "score", label: "match" },
    { key: "name", label: "name" },
    { key: "employees", label: "size" },
    { key: "founded", label: "founded" },
  ]
  return (
    <div className="inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-card p-0.5 font-mono text-[11px]">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() =>
            onChange({
              key: o.key,
              dir:
                sort.key === o.key
                  ? sort.dir === "desc"
                    ? "asc"
                    : "desc"
                  : o.key === "name"
                    ? "asc"
                    : "desc",
            })
          }
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded px-2.5 transition",
            sort.key === o.key
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
          {sort.key === o.key && (
            <ChevronDown
              className={cn(
                "size-3 transition-transform",
                sort.dir === "asc" && "rotate-180",
              )}
            />
          )}
        </button>
      ))}
    </div>
  )
}

// Official company logos via free, key-less, open icon endpoints.
// Chain: DuckDuckGo (best marks) → Google favicons (full coverage) → initials.
function logoSources(domain: string) {
  return [
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ]
}

function Logo({ domain, name, size = 36 }: { domain: string; name: string; size?: number }) {
  const sources = useMemo(() => logoSources(domain), [domain])
  const [idx, setIdx] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const exhausted = idx >= sources.length

  const initials = name
    .split(/[\s.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-secondary"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* initials sit underneath as the resting/fallback layer */}
      <span className="absolute font-mono text-[11px] font-medium text-muted-foreground">
        {initials || "·"}
      </span>
      {!exhausted && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={sources[idx]}
          src={sources[idx] || "/placeholder.svg"}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className={cn(
            "relative size-full bg-background object-contain p-1 transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={(e) => {
            // Google returns a 16px generic globe for unknown domains; keep it,
            // but treat truly tiny/empty responses as a miss.
            const img = e.currentTarget
            if (img.naturalWidth <= 1) {
              setIdx((i) => i + 1)
              return
            }
            setLoaded(true)
          }}
          onError={() => {
            setLoaded(false)
            setIdx((i) => i + 1)
          }}
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  )
}

function tierLabel(tier: Tier) {
  return tier === "high"
    ? "High match"
    : tier === "medium"
      ? "Medium match"
      : "Low match"
}

function tierClasses(tier: Tier) {
  return tier === "high"
    ? "text-tier-high"
    : tier === "medium"
      ? "text-tier-medium"
      : "text-muted-foreground"
}

function ScoreBreakdown({ row }: { row: EvalRow }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <span className={cn("font-mono text-[11px] uppercase tracking-wide", tierClasses(row.tier))}>
          {tierLabel(row.tier)}
        </span>
        <span className="font-mono text-xs tabular-nums text-foreground">
          {row.score}
          <span className="text-muted-foreground">/100</span>
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        {row.reasoning}
      </p>
      {row.signals.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {row.signals.map((s) => (
            <span
              key={s}
              className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function CompanyHoverCard({ row }: { row: EvalRow }) {
  const meta: { label: string; value: string }[] = [
    { label: "Category", value: row.category },
    { label: "HQ", value: row.hq },
    { label: "Headcount", value: `${row.employees} people` },
    { label: "Founded", value: String(row.founded) },
    { label: "Funding", value: row.funding },
  ]
  return (
    <HoverCardContent side="right" align="start" className="w-80 p-0">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <Logo domain={row.domain} name={row.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">{row.name}</span>
            <span className={cn("font-mono text-[10px] uppercase tracking-wide", tierClasses(row.tier))}>
              {row.tier}
            </span>
          </div>
          <a
            href={`https://${row.domain}`}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            {row.domain}
            <ArrowUpRight className="ml-0.5 size-3" />
          </a>
        </div>
        <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
          {row.score}
        </span>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-[13px] leading-relaxed text-foreground/80">{row.reasoning}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {meta.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.label}
              </dt>
              <dd className="truncate text-[12px] text-foreground">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </HoverCardContent>
  )
}

function Row({ row }: { row: EvalRow }) {
  const tierColor =
    row.tier === "high"
      ? "text-tier-high"
      : row.tier === "medium"
        ? "text-tier-medium"
        : "text-muted-foreground"

  const tierDot =
    row.tier === "high"
      ? "bg-tier-high"
      : row.tier === "medium"
        ? "bg-tier-medium"
        : "bg-muted-foreground"

  return (
    <>
      {/* tier */}
      <div className="col-span-1 flex items-center">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", tierDot)} />
          <span className={cn("font-mono text-[11px] uppercase font-medium", tierColor)}>
            {row.tier}
          </span>
        </div>
      </div>

      {/* company */}
      <div className="col-span-4 md:col-span-3 min-w-0">
        <HoverCard openDelay={120} closeDelay={80}>
          <HoverCardTrigger asChild>
            <div className="flex w-fit max-w-full items-center gap-3">
              <Logo domain={row.domain} name={row.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-medium text-foreground decoration-dotted underline-offset-4 group-hover:underline">
                    {row.name}
                  </span>
                  <a
                    href={`https://${row.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center font-mono text-[11px] text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                  >
                    {row.domain}
                    <ArrowUpRight className="ml-0.5 size-3" />
                  </a>
                </div>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {row.tagline}
                </p>
              </div>
            </div>
          </HoverCardTrigger>
          <CompanyHoverCard row={row} />
        </HoverCard>
      </div>

      {/* match + reasoning */}
      <div className="col-span-7 md:col-span-6 min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex w-fit max-w-full cursor-help items-center gap-3">
              <ScoreBar score={row.score} tier={row.tier} />
              <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums text-foreground">
                {row.score}
                <Info className="size-3 text-muted-foreground/60" />
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-xs">
            <ScoreBreakdown row={row} />
          </TooltipContent>
        </Tooltip>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-foreground/80">
          {row.reasoning}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {row.signals.map((s) => (
            <span
              key={s}
              className="inline-flex items-center rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* meta */}
      <div className="hidden md:col-span-2 md:flex flex-col items-end justify-center gap-0.5 font-mono text-[11px] text-muted-foreground">
        <span>{row.hq}</span>
        <span>
          {row.employees} ppl · {row.founded}
        </span>
        <span>{row.funding}</span>
      </div>
    </>
  )
}

function ScoreBar({ score, tier }: { score: number; tier: Tier }) {
  const color =
    tier === "high"
      ? "bg-tier-high"
      : tier === "medium"
        ? "bg-tier-medium"
        : "bg-muted-foreground"
  return (
    <div className="relative h-1.5 w-full max-w-[260px] overflow-hidden rounded-full bg-secondary">
      <motion.div
        className={cn("absolute inset-y-0 left-0", color)}
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ type: "spring", stiffness: 160, damping: 22 }}
      />
    </div>
  )
}

function DiscardedDrawer({
  open,
  onToggle,
  rows,
  onRestore,
}: {
  open: boolean
  onToggle: () => void
  rows: EvalRow[]
  onRestore: (id: string) => void
}) {
  return (
    <div className="border-t border-border bg-secondary/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-3 font-mono text-[11px] text-muted-foreground transition hover:text-foreground"
      >
        <span className="inline-flex items-center gap-2">
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
          discarded · {rows.length}
          <span className="text-muted-foreground/60">
            (low matches dropped from view)
          </span>
        </span>
        <span className="text-muted-foreground/70">
          {open ? "hide" : "show"}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <ul className="divide-y divide-border/60 px-5 pb-3">
              {rows.length === 0 && (
                <li className="py-3 text-center font-mono text-[11px] text-muted-foreground">
                  nothing discarded yet.
                </li>
              )}
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Logo domain={r.domain} name={r.name} size={24} />
                    <span className="truncate text-sm text-foreground/80">
                      {r.name}
                    </span>
                    <span className="hidden md:inline truncate font-mono text-[11px] text-muted-foreground">
                      {r.reasoning}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
                    <span className="tabular-nums text-muted-foreground">
                      {r.score}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRestore(r.id)}
                      className="inline-flex h-6 items-center gap-1 rounded border border-border bg-card px-2 text-muted-foreground transition hover:text-foreground hover:bg-secondary"
                    >
                      <Undo2 className="size-3" />
                      restore
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
