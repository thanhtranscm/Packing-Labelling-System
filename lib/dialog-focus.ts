"use client"

import { useRef } from "react"

/** Restore the launching control without moving the document or a table. */
export function useDialogFocus() {
  const launcher = useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: () => {
      launcher.current = document.activeElement instanceof HTMLElement
        ? document.activeElement : null
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault()
      if (launcher.current?.isConnected) launcher.current.focus({ preventScroll: true })
    },
  }
}
