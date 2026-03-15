import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function BaseInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return <Input className={cn("text-input", className)} {...props} />;
}
