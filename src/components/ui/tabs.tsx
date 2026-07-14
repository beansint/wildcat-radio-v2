"use client"

/**
 * shadcn `tabs` primitive, re-themed to the `wc-seg` segmented-pill spec
 * (globals.css `.wc-seg`) instead of shadcn's default underline/box tabs —
 * AGENTS.md: re-theme new primitives to the wc-* tokens, never leave the
 * default shadcn look. `TabsList` renders as a `.wc-seg` pill group and
 * `TabsTrigger` renders as its `button` children — the CSS descendant
 * selectors in globals.css style them, this file just wires state.
 * Prefer `@/components/mod/seg-tabs` for the common "tabs with a count"
 * case; reach for this primitive directly when you need real `TabsContent`
 * panels (Radix handles roving focus + aria-selected).
 */
import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("wc-seg", className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
