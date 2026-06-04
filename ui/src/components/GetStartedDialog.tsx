import { useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";

export const GET_STARTED_DISMISSED_KEY = "stockpilot.getStarted.dismissed";

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "Welcome to StockPilot AI",
    body: "Your personal AI investment-research desk. A team of AI analysts researches the market for you and reports back. Here's a 1-minute tour.",
  },
  {
    title: "Your Analysts",
    body: "In the sidebar under Your Analysts, you create AI agents that act as analyst roles (equity analyst, news sentinel, portfolio manager, and more). They do the research; you review it.",
  },
  {
    title: "Research Tasks",
    body: "Give your analysts work via Research Tasks. Click New Research Task (top of the sidebar) to ask a question or request a report; the assigned analyst works on it and posts findings.",
  },
  {
    title: "Routines",
    body: "Put research on autopilot under Routines. Use New from template for ready-made jobs like a daily watchlist briefing or weekly portfolio review — they run on a schedule.",
  },
  {
    title: "Your Finance tools",
    body: "The Finance section has your Portfolio (holdings), Watchlist (tickers you track), Alerts (price/earnings alerts that fire automatically), Market (live quotes & news), and Reports (saved research).",
  },
  {
    title: "Connect your API keys",
    body: "To power your analysts and get richer market data, connect your own keys: Settings → Connect API keys. You can add an AI provider key (Anthropic/OpenAI/Gemini) and optional market-data keys.",
  },
  {
    title: "You're all set",
    body: "Start by adding a few tickers to your Watchlist or creating your first analyst. You can reopen this tour any time from the account menu or onboarding.",
  },
];

function dismissTour() {
  try {
    localStorage.setItem(GET_STARTED_DISMISSED_KEY, "1");
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

interface GetStartedDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function GetStartedDialog({ open, onOpenChange }: GetStartedDialogProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex]!;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  function handleOpenChange(v: boolean) {
    if (!v) {
      // Closing without finishing — treat as skip
      dismissTour();
      setStepIndex(0);
    }
    onOpenChange(v);
  }

  function handleNext() {
    if (isLast) {
      dismissTour();
      setStepIndex(0);
      onOpenChange(false);
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleBack() {
    if (!isFirst) setStepIndex((i) => i - 1);
  }

  function handleSkip() {
    dismissTour();
    setStepIndex(0);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        {/* Header */}
        <DialogHeader className="pb-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="rounded-lg border border-border bg-muted/50 p-2 text-muted-foreground">
              <BookOpen className="size-4" />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Product Tour
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {stepIndex + 1} of {STEPS.length}
            </span>
          </div>
          <DialogTitle className="text-lg font-semibold leading-snug">
            {step.title}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex gap-1.5 mt-1">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => setStepIndex(i)}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i === stepIndex
                  ? "bg-foreground"
                  : i < stepIndex
                  ? "bg-foreground/40"
                  : "bg-border"
              )}
            />
          ))}
        </div>

        {/* Body */}
        <p className="text-sm text-muted-foreground leading-relaxed mt-2 min-h-[64px]">
          {step.body}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {!isFirst && (
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isLast && (
              <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
                Skip
              </Button>
            )}
            <Button size="sm" onClick={handleNext}>
              {isLast ? (
                <>
                  Get started
                  <X className="h-3.5 w-3.5 ml-1" />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
