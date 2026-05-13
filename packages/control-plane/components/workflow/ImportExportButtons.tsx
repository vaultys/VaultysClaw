import React, { useRef } from "react";
import { Download, Upload } from "lucide-react";

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
      const response = await fetch(`/api/workflows/${workflowId}/export`);
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers
          .get("content-disposition")
          ?.split("filename=")[1]
          ?.replace(/"/g, "") || "workflow.json";
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

      const response = await fetch("/api/workflows/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name || file.name.replace(".json", ""),
          description: data.description,
          definition: data.definition,
        }),
      });

      if (!response.ok) throw new Error("Import failed");

      const result = (await response.json()) as {
        success: boolean;
        message: string;
      };
      alert(result.message || "Workflow imported successfully");
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
          className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition"
          title="Import workflow from JSON file"
        >
          <Upload size={16} />
          Import
        </button>

        <button
          onClick={handleExport}
          disabled={!workflowId}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded transition ${workflowId
              ? "bg-green-50 text-green-700 hover:bg-green-100"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
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
