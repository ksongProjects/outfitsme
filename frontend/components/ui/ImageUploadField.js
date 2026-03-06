import { useRef, useState } from "react";

import BaseButton from "./BaseButton";

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
  enableCamera = true
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const browseInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleDragOver = (event) => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event) => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (event) => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    setIsDragOver(false);
    const droppedFile = event.dataTransfer?.files?.[0];
    if (!droppedFile) {
      return;
    }
    await onFileSelect(droppedFile);
  };

  const handleChange = async (event) => {
    if (disabled) {
      return;
    }
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile) {
      return;
    }
    await onFileSelect(selectedFile);
  };

  const openBrowsePicker = () => {
    if (disabled) {
      return;
    }
    browseInputRef.current?.click();
  };

  const openCameraPicker = () => {
    if (disabled) {
      return;
    }
    cameraInputRef.current?.click();
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
        <p id={`${id}-title`} className="dropzone-title">{title}</p>
        <p id={`${id}-subtext`} className="dropzone-subtext">{subtext}</p>
        <p className="dropzone-file">{fileName || emptyText}</p>
      </div>
      <div className="image-upload-actions">
        <BaseButton type="button" variant="ghost" onClick={openBrowsePicker} disabled={disabled}>
          {browseLabel}
        </BaseButton>
        {enableCamera ? (
          <BaseButton type="button" variant="ghost" onClick={openCameraPicker} disabled={disabled}>
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
