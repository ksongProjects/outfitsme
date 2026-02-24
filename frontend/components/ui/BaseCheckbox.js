import { Checkbox } from "@base-ui/react/checkbox";

export default function BaseCheckbox({ checked, onCheckedChange, className = "", ...props }) {
  const mergedClassName = ["base-checkbox", className].filter(Boolean).join(" ");
  return (
    <Checkbox.Root checked={checked} onCheckedChange={onCheckedChange} className={mergedClassName} {...props}>
      <Checkbox.Indicator className="base-checkbox-indicator" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="13" height="13" focusable="false">
          <path d="m4.5 10 3.5 3.5 7-7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}
