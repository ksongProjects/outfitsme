"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BaseButtonProps = Omit<React.ComponentProps<typeof Button>, "variant"> & {
  variant?: "primary" | "ghost" | "tab" | "icon" | "menu" | "link";
};

const buttonVariantMap: Record<
  NonNullable<BaseButtonProps["variant"]>,
  React.ComponentProps<typeof Button>["variant"]
> = {
  primary: "default",
  ghost: "outline",
  tab: "outline",
  icon: "outline",
  menu: "outline",
  link: "link",
};

export default function BaseButton({
  variant = "ghost",
  className,
  size,
  ...props
}: BaseButtonProps) {
  return (
    <Button
      variant={buttonVariantMap[variant]}
      size={variant === "icon" ? "icon" : size}
      className={cn(
        variant === "primary" && "primary-btn",
        variant === "ghost" && "ghost-btn",
        variant === "tab" && "tab-btn",
        variant === "icon" && "icon-btn",
        variant === "menu" && "settings-menu-btn",
        variant === "link" && "link-btn",
        className
      )}
      {...props}
    />
  );
}

