import PageChrome from "@/components/layout/PageChrome";
import { createWorkspaceAction } from "../actions";

export default function NewWorkspacePage() {
  return (
    <div className="p-6 max-w-lg">
      <PageChrome
        toolbar={{ title: "New workspace" }}
        breadcrumbs={[
          { label: "Workspaces", href: "/admin/workspaces" },
          { label: "New workspace" },
        ]}
      />

      <form action={createWorkspaceAction} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
          <input
            type="text"
            name="name"
            required
            autoFocus
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Description (optional)
          </label>
          <textarea
            name="description"
            rows={3}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Color</label>
          <input
            type="color"
            name="color"
            defaultValue="#6366f1"
            className="h-9 w-16 border border-neutral-200 rounded-lg bg-background p-0.5"
          />
        </div>

        <button
          type="submit"
          className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Create workspace
        </button>
      </form>
    </div>
  );
}
