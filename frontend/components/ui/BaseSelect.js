import { Select } from "@base-ui/react/select";

export default function BaseSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  className = ""
}) {
  const triggerClassName = ["text-input", "base-select-trigger", className].filter(Boolean).join(" ");

  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger id={id} className={triggerClassName}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="base-select-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="14" height="14" focusable="false">
            <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6}>
          <Select.Popup className="base-select-popup">
            <Select.List className="base-select-list">
              {(options || []).map((option) => (
                <Select.Item
                  key={`select-option-${option.value}`}
                  value={option.value}
                  disabled={Boolean(option.disabled)}
                  className="base-select-item"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
