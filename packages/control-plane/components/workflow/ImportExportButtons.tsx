import React, { useRef } from "react";
import { Download, Upload } from "lucide-react";
import { workflowsClient, unwrap } from "@/lib/api/ts-rest/client";

interface ImportExportButtonsProps {
  workflowId?: string;
  onImportComplete?: () => void;
}

export function ImportExportButtons({
  workflowId,
  onImportComplete,
}: ImportExportButtonsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!workflowId) {
      alert("Save workflow first");
      return;
    }

    try {
      const data = unwrap(
        await workflowsClient.export({ params: { id: workflowId } })
      );

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workflow-${data.name.replace(/\s+/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export workflow");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      await workflowsClient.import({
        body: {
          name: data.name || file.name.replace(".json", ""),
          description: data.description,
          definition: data.definition,
        },
      });

      onImportComplete?.();
    } catch (error) {
      console.error("Import failed:", error);
      alert("Failed to import workflow: " + String(error));
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <button
          onClick={handleImportClick}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-primary-50 text-primary-700 border border-primary-200 rounded hover:bg-primary-100 transition"
          title="Import workflow from JSON file"
        >
          <Upload size={16} />
          Import
        </button>

        <button
          onClick={handleExport}
          disabled={!workflowId}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded border transition ${
            workflowId
              ? "bg-success-50 text-success-700 border-success-200 hover:bg-success-100"
              : "bg-background-200 text-foreground-400 border-neutral-200 cursor-not-allowed"
          }`}
          title="Export workflow as JSON file"
        >
          <Download size={16} />
          Export
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Import workflow file"
      />
    </>
  );
}
