export function FormActions({
  onCancel,
  onSave,
  saveLabel,
  saving,
  disabled,
  showManageModels = false,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
  saving: boolean;
  disabled?: boolean;
  showManageModels?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-foreground-500 hover:text-foreground px-3 py-1.5"
      >
        Cancel
      </button>
      <button
        onClick={onSave}
        disabled={disabled || saving}
        className="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
      >
        {saving ? "Saving…" : saveLabel}
      </button>
      {showManageModels && (
        <a
          href="/models"
          className="text-xs text-foreground-500 hover:text-foreground ml-auto transition-colors"
        >
          Manage models →
        </a>
      )}
    </div>
  );
}
