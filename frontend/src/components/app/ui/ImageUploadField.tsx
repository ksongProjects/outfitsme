"use client";

import { useRef, useState } from "react";

import BaseButton from "@/components/app/ui/BaseButton";

type ImageUploadFieldProps = {
  id: string;
  fileName: string;
  onFileSelect: (file: File) => Promise<void> | void;
  accept?: string;
  title?: string;
  subtext?: string;
  emptyText?: string;
  disabled?: boolean;
  cameraLabel?: string;
  browseLabel?: string;
  capture?: "environment" | "user";
  enableCamera?: boolean;
};

export default function ImageUploadField({
  id,
  fileName,
  onFileSelect,
  accept = "image/*",
  title = "Drag and drop an image here",
  subtext = "Choose an existing image or take a new photo",
  emptyText = "No file selected",
  disabled = false,
  cameraLabel = "Take photo",
  browseLabel = "Browse files",
  capture = "environment",
  enableCamera = true,
}: ImageUploadFieldProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const browseInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    setIsDragOver(false);
    const droppedFile = event.dataTransfer?.files?.[0];
    if (!droppedFile) return;
    await onFileSelect(droppedFile);
  };

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile) return;
    await onFileSelect(selectedFile);
  };

  return (
    <div className="image-upload-field">
      <div
        className={`dropzone ${isDragOver ? "is-dragover" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="group"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-subtext`}
      >
        <p id={`${id}-title`} className="dropzone-title">
          {title}
        </p>
        <p id={`${id}-subtext`} className="dropzone-subtext">
          {subtext}
        </p>
        <p className="dropzone-file">{fileName || emptyText}</p>
      </div>
      <div className="image-upload-actions">
        <BaseButton type="button" variant="ghost" onClick={() => browseInputRef.current?.click()} disabled={disabled}>
          {browseLabel}
        </BaseButton>
        {enableCamera ? (
          <BaseButton type="button" variant="ghost" onClick={() => cameraInputRef.current?.click()} disabled={disabled}>
            {cameraLabel}
          </BaseButton>
        ) : null}
      </div>
      <input
        id={id}
        ref={browseInputRef}
        className="file-input-hidden"
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
      />
      {enableCamera ? (
        <input
          id={`${id}-camera`}
          ref={cameraInputRef}
          className="file-input-hidden"
          type="file"
          accept={accept}
          capture={capture}
          onChange={handleChange}
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}
