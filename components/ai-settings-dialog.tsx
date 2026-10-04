"use client"

import { AiSettingIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  AI_PROVIDER_PRESETS,
  type AiProvider,
  loadAiConfig,
  saveAiConfig,
  useAiConfig,
} from "@/lib/ai"
import { cn } from "@/lib/utils"

const PROVIDER_ORDER: AiProvider[] = [
  "openai",
  "openrouter",
  "gemini",
  "custom",
]

// API-key management for the browser-side AI features. The key is stored in
// localStorage and sent only to the chosen provider's endpoint.
export function AiSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [provider, setProvider] = useState<AiProvider>("openai")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState(
    AI_PROVIDER_PRESETS.openai.defaultModel
  )
  const [baseUrl, setBaseUrl] = useState("")
  const [hasExisting, setHasExisting] = useState(false)

  const preset = AI_PROVIDER_PRESETS[provider]

  // Load whatever is stored each time the dialog opens, so the form always
  // reflects reality (the key itself is masked only by the input type).
  const handleOpenChange = (next: boolean) => {
    if (next) {
      const config = loadAiConfig()
      setProvider(config?.provider ?? "openai")
      setApiKey(config?.apiKey ?? "")
      setModel(
        config?.model ??
          AI_PROVIDER_PRESETS[config?.provider ?? "openai"].defaultModel
      )
      setBaseUrl(config?.provider === "custom" ? config.baseUrl : "")
      setHasExisting(config !== null)
    }
    onOpenChange(next)
  }

  const submit = () => {
    const key = apiKey.trim()
    if (key === "" || (provider === "custom" && baseUrl.trim() === "")) {
      return
    }
    saveAiConfig({
      provider,
      apiKey: key,
      model: model.trim() !== "" ? model.trim() : preset.defaultModel,
      baseUrl:
        provider === "custom" ? baseUrl.trim().replace(/\/$/, "") : "",
    })
    onOpenChange(false)
  }

  const remove = () => {
    saveAiConfig(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI settings</DialogTitle>
          <DialogDescription>
            Bring your own key to unlock AI picks. Your key stays in this
            browser — it is sent only to the provider you choose, never to
            ShowList servers.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="grid gap-2">
            <span className="text-sm font-medium">Provider</span>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDER_ORDER.map((name) => (
                <Button
                  key={name}
                  type="button"
                  variant={provider === name ? "default" : "secondary"}
                  size="sm"
                  onClick={() => {
                    setProvider(name)
                    setModel(AI_PROVIDER_PRESETS[name].defaultModel)
                  }}
                >
                  {AI_PROVIDER_PRESETS[name].label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <label htmlFor="ai-api-key" className="text-sm font-medium">
              API key
            </label>
            <Input
              id="ai-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={preset.keyHint}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="ai-model" className="text-sm font-medium">
              Model
            </label>
            <Input
              id="ai-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={preset.defaultModel || "e.g. my-provider/model"}
            />
          </div>
          {provider === "custom" && (
            <div className="grid gap-2">
              <label htmlFor="ai-base-url" className="text-sm font-medium">
                Base URL
              </label>
              <Input
                id="ai-base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://your-provider.example/v1"
              />
            </div>
          )}
          <DialogFooter>
            {hasExisting && (
              <Button
                type="button"
                variant="ghost"
                onClick={remove}
                className="mr-auto"
              >
                Remove key
              </Button>
            )}
            <Button
              type="submit"
              disabled={
                apiKey.trim() === "" ||
                (provider === "custom" && baseUrl.trim() === "")
              }
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Header trigger for the dialog (signed-in only — features live behind auth).
export function AiSettingsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const config = useAiConfig()
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="AI settings"
        className={cn(
          config !== null ? "text-foreground" : "text-muted-foreground",
          className
        )}
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon icon={AiSettingIcon} />
      </Button>
      <AiSettingsDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
