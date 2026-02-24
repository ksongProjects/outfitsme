import { useState } from "react";

export default function ImageUploadField({
  id,
  fileName,
  onFileSelect,
  accept = "image/*",
  title = "Drag and drop an image here",
  subtext = "or click to browse files",
  emptyText = "No file selected",
  disabled = false
}) {
  const [isDragOver, setIsDragOver] = useState(false);

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
    if (!selectedFile) {
      return;
    }
    await onFileSelect(selectedFile);
  };

  return (
    <>
      <label
        htmlFor={id}
        className={`dropzone ${isDragOver ? "is-dragover" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p className="dropzone-title">{title}</p>
        <p className="dropzone-subtext">{subtext}</p>
        <p className="dropzone-file">{fileName || emptyText}</p>
      </label>
      <input
        id={id}
        className="file-input-hidden"
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
      />
    </>
  );
}
