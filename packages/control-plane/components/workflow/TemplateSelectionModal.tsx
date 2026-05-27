import React, { useState, useEffect } from "react";
import { X, Copy } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  suggestedCron?: string;
}

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
}

export function TemplateSelectionModal({
  isOpen,
  onClose,
  onSelectTemplate,
}: TemplateModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/workflows/templates");
      if (!res.ok) throw new Error("Failed to fetch templates");
      const data = (await res.json()) as { templates: Template[] };
      setTemplates(data.templates);

      // Extract unique categories
      const cats = Array.from(new Set(data.templates.map((t) => t.category)));
      setCategories(cats);
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = selectedCategory
    ? templates.filter((t) => t.category === selectedCategory)
    : templates;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-vc-surface rounded-lg shadow-xl w-full max-w-2xl max-h-screen overflow-y-auto border border-vc-border">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-vc-border sticky top-0 bg-vc-surface">
          <h2 className="text-xl font-bold text-vc-text">Workflow Templates</h2>
          <button
            onClick={onClose}
            className="text-vc-subtle hover:text-vc-text"
          >
            <X size={24} />
          </button>
        </div>

        {/* Category Filter */}
        <div className="px-6 py-4 border-b border-vc-border">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition ${selectedCategory === null
                  ? "bg-indigo-600 text-white"
                  : "bg-vc-raised text-vc-text-2 hover:bg-vc-border"
                }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition capitalize ${selectedCategory === category
                    ? "bg-indigo-600 text-white"
                    : "bg-vc-raised text-vc-text-2 hover:bg-vc-border"
                  }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Templates Grid */}
        <div className="px-6 py-6">
          {loading && (
            <div className="text-center text-vc-muted">Loading templates...</div>
          )}

          {!loading && filteredTemplates.length === 0 && (
            <div className="text-center text-vc-muted">No templates found</div>
          )}

          {!loading && filteredTemplates.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => {
                    onSelectTemplate(template.id);
                    onClose();
                  }}
                  className="p-4 border border-vc-border rounded-lg hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-vc-text">
                        {template.name}
                      </h3>
                      <p className="text-sm text-vc-muted mt-1">
                        {template.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="px-2 py-1 bg-vc-raised text-vc-text-2 text-xs rounded capitalize">
                          {template.category}
                        </span>
                        {template.suggestedCron && (
                          <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs rounded font-mono">
                            ⏰ {template.suggestedCron}
                          </span>
                        )}
                      </div>
                    </div>
                    <Copy size={18} className="text-vc-subtle flex-shrink-0 mt-1" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
