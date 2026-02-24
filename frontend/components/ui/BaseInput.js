import { Input as BaseInputPrimitive } from "@base-ui/react/input";

export default function BaseInput({ className = "", ...props }) {
  const mergedClassName = ["text-input", className].filter(Boolean).join(" ");
  return <BaseInputPrimitive className={mergedClassName} {...props} />;
}
