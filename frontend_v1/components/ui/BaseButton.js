import { Button as BaseButtonPrimitive } from "@base-ui/react/button";

const VARIANT_CLASS = {
  primary: "primary-btn",
  ghost: "ghost-btn",
  tab: "tab-btn",
  icon: "icon-btn",
  menu: "settings-menu-btn",
  link: "link-btn"
};

export default function BaseButton({
  variant = "ghost",
  className = "",
  ...props
}) {
  const mergedClassName = [VARIANT_CLASS[variant] || "", className].filter(Boolean).join(" ");
  return <BaseButtonPrimitive className={mergedClassName} {...props} />;
}
