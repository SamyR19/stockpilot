import { useState } from "react";
import type { Agent } from "@paperclipai/shared";
import { ROUTINE_TEMPLATES, buildRoutineDraftFromTemplate } from "@/lib/routineTemplates";
import type { RoutineTemplate } from "@/lib/routineTemplates";
import { routinesApi } from "@/api/routines";
import { useToastActions } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NewRoutineFromTemplateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  agents: Agent[];
  onCreated: (routineId: string) => void;
}

export function NewRoutineFromTemplateDialog({
  open,
  onOpenChange,
  companyId,
  agents,
  onCreated,
}: NewRoutineFromTemplateDialogProps) {
  const { pushToast } = useToastActions();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeAgentId, setAssigneeAgentId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedTemplate = selectedTemplateId
    ? (ROUTINE_TEMPLATES.find((t) => t.id === selectedTemplateId) ?? null)
    : null;

  function handleSelectTemplate(template: RoutineTemplate) {
    const draft = buildRoutineDraftFromTemplate(template);
    setSelectedTemplateId(template.id);
    setTitle(draft.title);
    setDescription(draft.description);
    setAssigneeAgentId("");
  }

  function handleBack() {
    setSelectedTemplateId(null);
    setTitle("");
    setDescription("");
    setAssigneeAgentId("");
  }

  function handleOpenChange(v: boolean) {
    if (!submitting) {
      if (!v) {
        // Reset on close
        setSelectedTemplateId(null);
        setTitle("");
        setDescription("");
        setAssigneeAgentId("");
      }
      onOpenChange(v);
    }
  }

  async function handleCreate() {
    if (!selectedTemplate || !assigneeAgentId) return;
    setSubmitting(true);
    try {
      const routine = await routinesApi.create(companyId, {
        title,
        description,
        assigneeAgentId,
      });
      try {
        await routinesApi.createTrigger(routine.id, {
          kind: "schedule",
          cronExpression: selectedTemplate.cronExpression,
          timezone: selectedTemplate.timezone,
          label: selectedTemplate.name,
        });
      } catch {
        pushToast({
          title: "Schedule not added",
          body: "Routine created, but the schedule couldn't be added. Open it and add a trigger.",
          tone: "error",
        });
      }
      onCreated(routine.id);
      onOpenChange(false);
    } catch {
      pushToast({
        title: "Couldn't create routine",
        body: "Couldn't create the routine. Please try again.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const activeAgents = agents.filter((a) => a.status !== "terminated");
  const noAgents = activeAgents.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0"
      >
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              New routine from template
            </p>
            <p className="text-sm text-muted-foreground">
              {selectedTemplate
                ? "Review and customise before creating."
                : "Pick a template to get started."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!selectedTemplate ? (
            // VIEW A — template picker
            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {ROUTINE_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className="flex flex-col gap-1.5 rounded-lg border border-border p-4 text-left hover:bg-accent/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => handleSelectTemplate(template)}
                >
                  <p className="text-sm font-semibold">{template.name}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{template.blurb}</p>
                  <div className="mt-auto pt-2 flex flex-col gap-0.5">
                    <p className="text-xs text-muted-foreground">{template.scheduleLabel}</p>
                    <p className="text-xs text-muted-foreground italic">{template.roleHint}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            // VIEW B — edit & confirm
            <div className="flex flex-col gap-4 p-5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Title
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Routine title"
                  disabled={submitting}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Instructions
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this routine should do..."
                  rows={6}
                  disabled={submitting}
                  className="resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Assignee
                </label>
                {noAgents ? (
                  <p className="text-sm text-muted-foreground">
                    Create an agent first to assign this routine.
                  </p>
                ) : (
                  <Select
                    value={assigneeAgentId}
                    onValueChange={setAssigneeAgentId}
                    disabled={submitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeAgents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-0.5">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Schedule
                </p>
                <p className="text-sm text-muted-foreground">{selectedTemplate.scheduleLabel}</p>
              </div>
            </div>
          )}
        </div>

        {selectedTemplate ? (
          <div className="shrink-0 flex items-center justify-between gap-3 border-t border-border/60 px-5 py-4">
            <Button variant="ghost" size="sm" onClick={handleBack} disabled={submitting}>
              Back
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting || !assigneeAgentId || noAgents || !title.trim()}
            >
              {submitting ? "Creating..." : "Create routine"}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
