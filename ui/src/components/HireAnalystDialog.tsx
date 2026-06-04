import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { agentsApi } from "../api/agents";
import { apiKeysApi } from "../api/apiKeys";
import { queryKeys } from "../lib/queryKeys";
import { useToastActions } from "../context/ToastContext";
import { ANALYST_PERSONAS, type AnalystPersona } from "../lib/analystPersonas";
import { listUIAdapters, getUIAdapter } from "../adapters";
import { defaultCreateValues } from "./agent-config-defaults";
import type { CreateConfigValues } from "./AgentConfigForm";
import { ApiKeysWizard } from "./ApiKeysWizard";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import { DEFAULT_OPENCODE_LOCAL_MODEL } from "@paperclipai/adapter-opencode-local";
import { cn } from "@/lib/utils";

interface HireAnalystDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  onHired: (agentId: string) => void;
}

function createValuesForAdapterType(
  adapterType: CreateConfigValues["adapterType"],
): CreateConfigValues {
  const { adapterType: _discard, ...defaults } = defaultCreateValues;
  const nextValues: CreateConfigValues = { ...defaults, adapterType };
  if (adapterType === "codex_local") {
    nextValues.model = DEFAULT_CODEX_LOCAL_MODEL;
    nextValues.dangerouslyBypassSandbox =
      DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;
  } else if (adapterType === "gemini_local") {
    nextValues.model = DEFAULT_GEMINI_LOCAL_MODEL;
  } else if (adapterType === "cursor") {
    nextValues.model = DEFAULT_CURSOR_LOCAL_MODEL;
  } else if (adapterType === "opencode_local") {
    nextValues.model = DEFAULT_OPENCODE_LOCAL_MODEL;
  }
  return nextValues;
}

function defaultAdapterTypeFromKeys(connectedKeys: string[]): CreateConfigValues["adapterType"] {
  if (connectedKeys.some((k) => k.startsWith("ai.anthropic"))) return "claude_local";
  if (connectedKeys.some((k) => k.startsWith("ai.openai"))) return "hermes_local" as CreateConfigValues["adapterType"];
  if (connectedKeys.some((k) => k.startsWith("ai.google"))) return "gemini_local";
  return defaultCreateValues.adapterType;
}

export function HireAnalystDialog({
  open,
  onOpenChange,
  companyId,
  onHired,
}: HireAnalystDialogProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();

  const keysQuery = useQuery({
    queryKey: queryKeys.apiKeys.list(companyId),
    queryFn: () => apiKeysApi.list(companyId),
    enabled: open,
  });
  const connectedKeys = keysQuery.data?.keys ?? [];

  const [selected, setSelected] = useState<AnalystPersona | null>(null);
  const [name, setName] = useState("");
  const [configValues, setConfigValues] = useState<CreateConfigValues>(defaultCreateValues);
  const [hiring, setHiring] = useState(false);
  const [keysWizardOpen, setKeysWizardOpen] = useState(false);

  const adapters = listUIAdapters().filter((a) => {
    // Only show adapters that make sense for a simple pick — filter out internal-only ones
    return !["process", "http"].includes(a.type);
  });

  const hasAiKey = connectedKeys.some((k) => k.startsWith("ai."));

  function selectPersona(persona: AnalystPersona) {
    setSelected(persona);
    setName(persona.name);
    const adapterType = defaultAdapterTypeFromKeys(connectedKeys);
    const values = createValuesForAdapterType(adapterType);
    setConfigValues(values);
  }

  function handleAdapterChange(adapterType: string) {
    const values = createValuesForAdapterType(adapterType as CreateConfigValues["adapterType"]);
    setConfigValues(values);
  }

  function handleClose(v: boolean) {
    if (!v) {
      setSelected(null);
      setName("");
      setConfigValues(defaultCreateValues);
    }
    onOpenChange(v);
  }

  async function handleHire() {
    if (!selected || !name.trim()) return;
    setHiring(true);
    try {
      const adapter = getUIAdapter(configValues.adapterType);
      const adapterConfig = adapter.buildAdapterConfig(configValues);
      const result = await agentsApi.hire(companyId, {
        name: name.trim(),
        role: selected.role,
        ...(selected.icon ? { icon: selected.icon } : {}),
        desiredSkills: [selected.skillKey],
        adapterType: configValues.adapterType,
        adapterConfig,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
      pushToast({ title: "Analyst hired", tone: "success" });
      onHired(result.agent.id);
      handleClose(false);
    } catch (err) {
      pushToast({
        title: "Couldn't hire analyst",
        body: (err as Error)?.message,
        tone: "error",
      });
    } finally {
      setHiring(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selected ? `Configure ${selected.name}` : "Hire an Analyst"}
            </DialogTitle>
          </DialogHeader>

          {!selected ? (
            /* View A — persona picker */
            <div className="grid grid-cols-2 gap-3 py-2">
              {ANALYST_PERSONAS.map((persona) => (
                <button
                  key={persona.id}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                  onClick={() => selectPersona(persona)}
                >
                  <span className="text-sm font-semibold">{persona.name}</span>
                  <span className="text-xs text-muted-foreground leading-snug">{persona.blurb}</span>
                </button>
              ))}
            </div>
          ) : (
            /* View B — configure */
            <div className="space-y-4 py-2">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Analyst name"
                />
              </div>

              {/* Brain / Adapter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Brain</label>
                <Select
                  value={configValues.adapterType}
                  onValueChange={handleAdapterChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select adapter" />
                  </SelectTrigger>
                  <SelectContent>
                    {adapters.map((a) => (
                      <SelectItem key={a.type} value={a.type}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model (if applicable) */}
              {configValues.model !== undefined && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Model</label>
                  <Input
                    value={configValues.model}
                    onChange={(e) =>
                      setConfigValues((prev) => ({ ...prev, model: e.target.value }))
                    }
                    placeholder="e.g. claude-opus-4-5"
                  />
                </div>
              )}

              {/* Key awareness notice */}
              {!hasAiKey && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground space-y-2">
                  <p>Connect an AI key so your analyst has a brain.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setKeysWizardOpen(true)}
                  >
                    Connect API keys
                  </Button>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(null)}
                  disabled={hiring}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  disabled={hiring || !name.trim()}
                  onClick={handleHire}
                >
                  {hiring ? "Hiring…" : "Hire Analyst"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ApiKeysWizard
        open={keysWizardOpen}
        onOpenChange={setKeysWizardOpen}
        companyId={companyId}
        onDone={() => keysQuery.refetch()}
      />
    </>
  );
}
