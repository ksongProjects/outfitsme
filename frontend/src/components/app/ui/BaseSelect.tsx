"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelectOption } from "@/lib/types";
import { cn } from "@/lib/utils";

type BaseSelectProps = {
  id?: string;
  value?: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
};

export default function BaseSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  className = "",
}: BaseSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue !== null) {
          onValueChange(nextValue);
        }
      }}
    >
      <SelectTrigger id={id} className={cn("text-input base-select-trigger w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="base-select-popup">
        {options.map((option) => (
          <SelectItem
            key={`select-option-${option.value}`}
            value={option.value}
            disabled={Boolean(option.disabled)}
            className="base-select-item"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
