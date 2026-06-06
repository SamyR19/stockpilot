import { useEffect, useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { FileText, Trash2, Search, BookOpen } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { queryKeys } from "../lib/queryKeys"
import { researchApi } from "../api/research"
import type { ResearchReport } from "../api/research"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "../components/EmptyState"
import { PageSkeleton } from "../components/PageSkeleton"

const BULLISH = new Set(["buy", "strong_buy", "overweight"])
const BEARISH = new Set(["sell", "strong_sell", "underweight"])

const REC_FILTERS = ["All", "Buy", "Hold", "Sell", "Watch"] as const
type RecFilter = (typeof REC_FILTERS)[number]

function recommendationBadge(recommendation: string) {
  const key = recommendation.trim().toLowerCase()
  if (BULLISH.has(key)) {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-600 text-white">
        {recommendation}
      </Badge>
    )
  }
  if (BEARISH.has(key)) {
    return <Badge variant="destructive">{recommendation}</Badge>
  }
  return <Badge variant="secondary">{recommendation}</Badge>
}

function ReportReadingModal({ report, open, onClose }: { report: ResearchReport | null; open: boolean; onClose: () => void }) {
  if (!report) return null
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle asChild>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-base">{report.ticker}</span>
              <Badge variant="secondary">{report.reportType}</Badge>
              {report.recommendation && recommendationBadge(report.recommendation)}
              {report.targetPriceCents != null && (
                <span className="text-sm tabular-nums text-foreground/90">
                  ${(report.targetPriceCents / 100).toFixed(2)}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {new Date(report.createdAt).toLocaleDateString()}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <pre className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90 font-sans">
            {report.content}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ReportCard({
  report,
  onDelete,
  onRead,
  deleteDisabled,
}: {
  report: ResearchReport
  onDelete: () => void
  onRead: () => void
  deleteDisabled?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="flex flex-wrap items-center gap-2 text-left hover:opacity-80 transition-opacity"
          onClick={onRead}
          aria-label={`Read full report for ${report.ticker}`}
        >
          <span className="font-mono font-bold text-sm">{report.ticker}</span>
          <Badge variant="secondary">{report.reportType}</Badge>
          {report.recommendation && recommendationBadge(report.recommendation)}
          {report.targetPriceCents != null && (
            <span className="text-sm tabular-nums text-foreground/90">
              ${(report.targetPriceCents / 100).toFixed(2)}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {new Date(report.createdAt).toLocaleDateString()}
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRead}
            aria-label={`Read report for ${report.ticker}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <BookOpen className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            disabled={deleteDisabled}
            aria-label={`Delete report for ${report.ticker}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="text-sm text-foreground/75 mt-2 line-clamp-3 whitespace-pre-wrap">{report.content}</div>
    </div>
  )
}

export function Reports() {
  const { selectedCompanyId } = useCompany()
  const { setBreadcrumbs } = useBreadcrumbs()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState("")
  const [recFilter, setRecFilter] = useState<RecFilter>("All")
  const [readingReport, setReadingReport] = useState<ResearchReport | null>(null)

  useEffect(() => {
    setBreadcrumbs([{ label: "Reports" }])
  }, [setBreadcrumbs])

  const { data: reports, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.research.list(selectedCompanyId!),
    queryFn: () => researchApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  })

  const deleteMutation = useMutation({
    mutationFn: ({ reportId, companyId }: { reportId: string; companyId: string }) =>
      researchApi.remove(companyId, reportId),
    onSuccess: (_data, { companyId }) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.research.list(companyId) }),
  })

  const filtered = useMemo(() => {
    if (!reports) return []
    const q = filter.trim().toLowerCase()
    return reports.filter((r) => {
      // Text search
      if (q) {
        const matches =
          r.ticker.toLowerCase().includes(q) ||
          r.content.toLowerCase().includes(q) ||
          r.reportType.toLowerCase().includes(q)
        if (!matches) return false
      }
      // Recommendation filter
      if (recFilter !== "All") {
        const rec = r.recommendation?.trim().toLowerCase() ?? ""
        if (!rec.includes(recFilter.toLowerCase())) return false
      }
      return true
    })
  }, [reports, filter, recFilter])

  if (!selectedCompanyId)
    return <EmptyState icon={FileText} message="Select a workspace to view research reports." />
  if (isLoading) return <PageSkeleton />
  if (isError) {
    return <EmptyState icon={FileText} message={error instanceof Error ? error.message : "Failed to load research reports."} />
  }

  const hasReports = (reports?.length ?? 0) > 0

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Research reports generated by your analyst agents</p>
      </div>

      {hasReports && (
        <div className="space-y-3">
          {/* Search bar */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reports…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
              maxLength={100}
            />
          </div>

          {/* Recommendation filter chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {REC_FILTERS.map((rec) => (
              <Button
                key={rec}
                variant={recFilter === rec ? "default" : "outline"}
                size="sm"
                onClick={() => setRecFilter(rec)}
                className="h-7 px-3 text-xs"
              >
                {rec}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground ml-1">
              {filtered.length} {filtered.length === 1 ? "report" : "reports"}
            </span>
          </div>
        </div>
      )}

      {!hasReports ? (
        <EmptyState
          icon={FileText}
          message="No research reports yet. Your analyst agents will generate reports here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} message="No reports match your search." />
      ) : (
        <div className="space-y-3">
          {filtered.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onRead={() => setReadingReport(report)}
              onDelete={() => deleteMutation.mutate({ reportId: report.id, companyId: selectedCompanyId! })}
              deleteDisabled={deleteMutation.isPending && deleteMutation.variables?.reportId === report.id}
            />
          ))}
        </div>
      )}

      <ReportReadingModal
        report={readingReport}
        open={readingReport !== null}
        onClose={() => setReadingReport(null)}
      />
    </div>
  )
}
