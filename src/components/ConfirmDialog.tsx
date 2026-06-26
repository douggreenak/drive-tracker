"use client";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="md-dialog-overlay" onClick={onCancel}>
      <div className="md-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p
          className="text-sm mb-6"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
          {message}
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="md-tonal-button">
            Cancel
          </button>
          <button onClick={onConfirm} className="md-danger-button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
