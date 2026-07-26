"use client"

import { useMutation } from "convex/react"
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
import { api } from "@/convex/_generated/api"
import { type Id } from "@/convex/_generated/dataModel"

// One create-collection modal, shared by the Collections tab dropdown and
// the card overlay popover ("New collection").
export function CreateCollectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (collectionId: Id<"collections">) => void
}) {
  const create = useMutation(api.collections.create)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const trimmed = name.trim()
    if (trimmed === "" || saving) {
      return
    }
    setSaving(true)
    try {
      const collectionId = await create({ name: trimmed })
      onOpenChange(false)
      setName("")
      onCreated?.(collectionId)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setName("")
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create collection</DialogTitle>
          <DialogDescription>
            Group movies and shows into your own list.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name"
            aria-label="Collection name"
            autoFocus
          />
          <DialogFooter>
            <Button type="submit" disabled={name.trim() === "" || saving}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
