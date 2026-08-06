import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 [border-radius:var(--r-button)] border border-input bg-card px-3 py-1 text-sm",
        "shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] transition-[border-color,box-shadow] outline-none",
        "placeholder:text-muted-foreground",
        "focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/20",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
