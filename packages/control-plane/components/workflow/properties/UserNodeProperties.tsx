"use client";

import { Search } from "lucide-react";
import type { WorkflowMembers } from "@/hooks/useWorkflowMembers";
import type { FlowNode, UpdateNodeData, UpdateNodeFields } from "./types";

export function UserNodeProperties({
  node,
  members,
  updateNodeData,
  updateNodeFields,
}: {
  node: FlowNode;
  members: WorkflowMembers;
  updateNodeData: UpdateNodeData;
  updateNodeFields: UpdateNodeFields;
}) {
  const {
    users,
    filteredUsers,
    userSearchQuery,
    setUserSearchQuery,
    userLoading,
  } = members;
  const assignedUser = users.find((u) => u.id === node.data.assignedUserId);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-1">
          Mode
        </label>
        <select
          value={node.data.mode || "approval"}
          onChange={(e) => updateNodeData("mode", e.target.value)}
          className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="approval">Approval (blocks workflow)</option>
          <option value="notification">Notification (continues)</option>
        </select>
        <p className="text-xs text-foreground-400 mt-1">
          Approval mode waits for user confirmation. Notification mode sends a
          message and continues.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-1">
          Message
        </label>
        <textarea
          value={node.data.message || ""}
          onChange={(e) => updateNodeData("message", e.target.value)}
          className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent h-20"
          placeholder="Enter a message for the user..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-1">
          Assigned user
        </label>

        <div className="relative mb-2">
          <Search
            size={14}
            className="absolute left-3 top-2.5 text-foreground-400"
          />
          <input
            type="text"
            placeholder="Search users..."
            value={userSearchQuery}
            onChange={(e) => setUserSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <select
          value={node.data.assignedUserId || ""}
          onChange={(e) => {
            const selected = users.find((u) => u.id === e.target.value);
            updateNodeFields({
              assignedUserId: e.target.value || undefined,
              assignedUserName: selected?.name || undefined,
            });
          }}
          className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="">-- Select user --</option>
          {userLoading ? (
            <option disabled>Loading users...</option>
          ) : filteredUsers.length === 0 ? (
            <option disabled>No users found</option>
          ) : (
            filteredUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))
          )}
        </select>

        {assignedUser && (
          <p className="text-xs text-foreground-400 mt-1">
            {assignedUser.name} — {assignedUser.email}
          </p>
        )}
        <p className="text-xs text-foreground-400 mt-1">
          The user who will receive this step for{" "}
          {node.data.mode === "approval" ? "approval" : "notification"}.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-1">
          Timeout (minutes, optional)
        </label>
        <input
          type="number"
          value={node.data.timeout || ""}
          onChange={(e) =>
            updateNodeData(
              "timeout",
              e.target.value ? parseInt(e.target.value) : undefined
            )
          }
          className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="Leave empty for no timeout"
          min="1"
          step="1"
        />
        <p className="text-xs text-foreground-400 mt-1">
          If set, workflow auto-continues after timeout (approval mode only).
        </p>
      </div>
    </div>
  );
}
