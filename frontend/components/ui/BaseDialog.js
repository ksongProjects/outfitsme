import { Dialog } from "@base-ui/react/dialog";

import BaseButton from "./BaseButton";

export default function BaseDialog({
  open,
  onOpenChange,
  title,
  size = "md",
  children
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Popup className={`modal-panel ${size === "sm" ? "modal-panel-sm" : ""}`}>
          <div className="modal-header">
            <Dialog.Title className="modal-title">{title}</Dialog.Title>
            <BaseButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </BaseButton>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
