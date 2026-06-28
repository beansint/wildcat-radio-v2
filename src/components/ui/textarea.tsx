import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn("wc-textarea aria-invalid:border-destructive", className)}
      {...props}
    />
  )
}

export { Textarea }
