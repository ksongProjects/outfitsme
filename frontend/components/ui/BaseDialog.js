import { Dialog } from "@base-ui/react/dialog";

import BaseButton from "./BaseButton";

export default function BaseDialog({
  open,
  onOpenChange,
  title,
  size = "md",
  scrollable = true,
  headerActions = null,
  children
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Viewport className="modal-viewport">
          <Dialog.Popup className={`modal-panel ${size === "sm" ? "modal-panel-sm" : ""} ${scrollable ? "" : "modal-panel-no-scroll"}`}>
            <div className="modal-header">
              <Dialog.Title className="modal-title">{title}</Dialog.Title>
              <div className="modal-header-actions">
                {headerActions}
                <BaseButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Close
                </BaseButton>
              </div>
            </div>
            <div className="modal-body">
              {children}
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
