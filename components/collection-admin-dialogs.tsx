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

// Rename one collection (opened from a collection card's kebab).
export function RenameCollectionDialog({
  target,
  onOpenChange,
}: {
  target: { id: Id<"collections">; name: string } | null
  onOpenChange: (open: boolean) => void
}) {
  const rename = useMutation(api.collections.rename)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  const open = target !== null

  const submit = async () => {
    const trimmed = name.trim()
    if (target === null || trimmed === "" || saving) {
      return
    }
    setSaving(true)
    try {
      await rename({ collectionId: target.id, name: trimmed })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(target?.name ?? "")
        } else {
          onOpenChange(false)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename collection</DialogTitle>
          <DialogDescription>Give it a new name.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Input
            value={target === null ? "" : name || target.name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name"
            aria-label="Collection name"
            autoFocus
          />
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                target === null ||
                name.trim() === "" ||
                name.trim() === target.name ||
                saving
              }
            >
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Delete one collection with a confirmation step. Items in it keep their
// flags; only items held solely by this collection are cleaned up.
export function DeleteCollectionDialog({
  target,
  onOpenChange,
}: {
  target: { id: Id<"collections">; name: string; itemCount: number } | null
  onOpenChange: (open: boolean) => void
}) {
  const remove = useMutation(api.collections.remove)
  const [deleting, setDeleting] = useState(false)

  const open = target !== null

  const submit = async () => {
    if (target === null || deleting) {
      return
    }
    setDeleting(true)
    try {
      await remove({ collectionId: target.id })
      onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{target?.name}”?</DialogTitle>
          <DialogDescription>
            The {target?.itemCount === 1 ? "item" : "items"} in it stay in
            your lists — only the collection goes away. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => void submit()}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
