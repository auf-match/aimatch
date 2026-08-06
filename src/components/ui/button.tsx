"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-all outline-none " +
  "focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] " +
  "disabled:pointer-events-none disabled:opacity-40 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /* Orange filled — primary action */
        default:
          "bg-[#F97029] text-white hover:bg-[#F97029]/90",
        /* Orange tinted — accent action */
        tinted:
          "bg-primary/10 text-primary hover:bg-primary/18",
        /* Orange filled (alias) */
        accent:
          "bg-[#F97029] text-white hover:bg-[#F97029]/90",
        /* White outlined */
        outline:
          "bg-card text-foreground border border-border hover:bg-secondary shadow-[0_1px_4px_0_oklch(0_0_0/0.06)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost:
          "text-foreground hover:bg-secondary",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-2 px-4 text-sm rounded-lg",
        xs:      "h-6 gap-1 px-2.5 text-xs rounded-md [&_svg:not([class*='size-'])]:size-3",
        sm:      "h-8 gap-1.5 px-3.5 text-sm rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        lg:      "h-11 gap-2 px-6 text-[15px] rounded-lg",
        pill:    "h-9 gap-2 px-5 text-sm rounded-full",
        icon:    "h-9 w-9 rounded-lg",
        "icon-sm": "h-8 w-8 rounded-lg",
        "icon-xs": "h-7 w-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
