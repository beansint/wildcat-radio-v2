"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-[26px] w-11 shrink-0 cursor-pointer items-center rounded-full bg-input transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-maroon dark:data-[state=checked]:bg-gold",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-5 translate-x-[3px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.3)] transition-transform data-[state=checked]:translate-x-[21px] dark:data-[state=checked]:bg-ink"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
