"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type BaseCheckboxProps = React.ComponentProps<typeof Checkbox>;

export default function BaseCheckbox({
  className,
  ...props
}: BaseCheckboxProps) {
  return <Checkbox className={cn("base-checkbox", className)} {...props} />;
}
