import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiKeysApi } from "../api/apiKeys";
import {
  AI_KEY_PROVIDERS,
  DATA_KEY_PROVIDERS,
  isConnected,
  type KeyProviderMeta,
} from "../lib/apiKeyProviders";
import { queryKeys } from "../lib/queryKeys";
import { useToastActions } from "../context/ToastContext";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiKeysWizardProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  onDone?: () => void;
}

function ProviderCard({
  meta,
  selected,
  connected,
  onSelect,
}: {
  meta: KeyProviderMeta;
  selected: boolean;
  connected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/40 hover:bg-muted/40"
      )}
    >
      <span className="font-medium">{meta.label}</span>
      {connected && (
        <span className="flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Connected
        </span>
      )}
    </button>
  );
}

export function ApiKeysWizard({
  open,
  onOpenChange,
  companyId,
  onDone,
}: ApiKeysWizardProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();

  const keysQuery = useQuery({
    queryKey: queryKeys.apiKeys.list(companyId),
    queryFn: () => apiKeysApi.list(companyId),
    enabled: open,
  });

  const connected = keysQuery.data?.keys ?? [];

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [aiProvider, setAiProvider] = useState(AI_KEY_PROVIDERS[0].provider);
  const [aiValue, setAiValue] = useState("");
  const [dataProvider, setDataProvider] = useState(DATA_KEY_PROVIDERS[0].provider);
  const [dataValue, setDataValue] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedAiMeta = AI_KEY_PROVIDERS.find((p) => p.provider === aiProvider)!;
  const selectedDataMeta = DATA_KEY_PROVIDERS.find((p) => p.provider === dataProvider)!;

  const anyAiConnected = AI_KEY_PROVIDERS.some((p) =>
    isConnected(connected, "ai", p.provider)
  );

  async function saveKey(
    kind: "ai" | "data",
    provider: string,
    value: string
  ): Promise<boolean> {
    setSaving(true);
    try {
      await apiKeysApi.set(companyId, kind, provider, value);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys.list(companyId),
      });
      pushToast({ title: "Key saved", tone: "success" });
      return true;
    } catch {
      pushToast({
        title: "Couldn't save key",
        body: "Check the key and try again.",
        tone: "error",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleClose(v: boolean) {
    if (!v) {
      // Reset state on close
      setStep(1);
      setAiValue("");
      setDataValue("");
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>Connect an AI key</DialogTitle>
              <DialogDescription>
                Add your API key to power AI features. Your key is stored
                securely and never shown after saving.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 mt-1">
              {AI_KEY_PROVIDERS.map((p) => (
                <ProviderCard
                  key={p.provider}
                  meta={p}
                  selected={aiProvider === p.provider}
                  connected={isConnected(connected, "ai", p.provider)}
                  onSelect={() => setAiProvider(p.provider)}
                />
              ))}
            </div>
            <div className="space-y-2 mt-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedAiMeta.label} key
                </span>
                <a
                  href={selectedAiMeta.helpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Get a key
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <Input
                type="password"
                placeholder={selectedAiMeta.placeholder}
                value={aiValue}
                onChange={(e) => setAiValue(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                className="flex-1"
                disabled={saving || !aiValue.trim()}
                onClick={async () => {
                  if (await saveKey("ai", aiProvider, aiValue)) {
                    setAiValue("");
                    setStep(2);
                  }
                }}
              >
                {saving ? "Saving…" : "Save & continue"}
              </Button>
              {anyAiConnected && (
                <Button variant="outline" onClick={() => setStep(2)}>
                  Skip
                </Button>
              )}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle>Connect a market-data key</DialogTitle>
              <DialogDescription>
                Optional — connect a market-data key for higher-quality,
                unthrottled data.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 mt-1">
              {DATA_KEY_PROVIDERS.map((p) => (
                <ProviderCard
                  key={p.provider}
                  meta={p}
                  selected={dataProvider === p.provider}
                  connected={isConnected(connected, "data", p.provider)}
                  onSelect={() => setDataProvider(p.provider)}
                />
              ))}
            </div>
            <div className="space-y-2 mt-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedDataMeta.label} key
                </span>
                <a
                  href={selectedDataMeta.helpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Get a key
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <Input
                type="password"
                placeholder={selectedDataMeta.placeholder}
                value={dataValue}
                onChange={(e) => setDataValue(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                className="flex-1"
                disabled={saving || !dataValue.trim()}
                onClick={async () => {
                  if (await saveKey("data", dataProvider, dataValue)) {
                    setDataValue("");
                    setStep(3);
                  }
                }}
              >
                {saving ? "Saving…" : "Save & continue"}
              </Button>
              <Button variant="outline" onClick={() => setStep(3)}>
                Skip
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle>You're all set</DialogTitle>
              <DialogDescription>
                Here are your connected API keys.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 mt-1">
              {connected.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No keys connected yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {connected.map((key) => {
                    const [kind, provider] = key.split(".");
                    const allProviders = [...AI_KEY_PROVIDERS, ...DATA_KEY_PROVIDERS];
                    const meta = allProviders.find(
                      (p) => p.kind === kind && p.provider === provider
                    );
                    const kindLabel = kind === "ai" ? "AI" : "Data";
                    const label = meta?.label ?? provider;
                    return (
                      <li
                        key={key}
                        className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span className="text-muted-foreground">{kindLabel}:</span>
                        <span className="font-medium">{label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <Button
              className="mt-2 w-full"
              onClick={() => {
                onDone?.();
                handleClose(false);
              }}
            >
              Finish
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
