"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import BaseButton from "@/components/app/ui/BaseButton";

type BaseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  size?: "sm" | "md" | "fit" | "image";
  scrollable?: boolean;
  headerActions?: React.ReactNode;
  panelClassName?: string;
  children: React.ReactNode;
};

export default function BaseDialog({
  open,
  onOpenChange,
  title,
  size = "md",
  scrollable = true,
  headerActions = null,
  panelClassName = "",
  children,
}: BaseDialogProps) {
  const panelClasses = [
    "modal-panel",
    size === "sm" ? "modal-panel-sm" : "",
    size === "fit" ? "modal-panel-fit" : "",
    size === "image" ? "modal-panel-image" : "",
    scrollable ? "" : "modal-panel-no-scroll",
    panelClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={panelClasses} showCloseButton={false}>
        <div className="modal-header o-split o-split--start">
          <DialogTitle className="modal-title">{title}</DialogTitle>
          <div className="modal-header-actions o-cluster o-cluster--wrap o-cluster--stack-sm">
            {headerActions}
            <BaseButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </BaseButton>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
