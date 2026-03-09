import { Dialog } from "@base-ui/react/dialog";

import BaseButton from "./BaseButton";

export default function BaseDialog({
  open,
  onOpenChange,
  title,
  size = "md",
  scrollable = true,
  headerActions = null,
  panelClassName = "",
  children
}) {
  const panelClasses = [
    "modal-panel",
    size === "sm" ? "modal-panel-sm" : "",
    size === "fit" ? "modal-panel-fit" : "",
    size === "image" ? "modal-panel-image" : "",
    scrollable ? "" : "modal-panel-no-scroll",
    panelClassName
  ].filter(Boolean).join(" ");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" onClick={() => onOpenChange(false)} />
        <Dialog.Viewport className="modal-viewport" onClick={(e) => {
          if (e.target === e.currentTarget) {
            onOpenChange(false);
          }
        }}>
          <Dialog.Popup className={panelClasses}>
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
