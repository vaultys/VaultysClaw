"use client";

import { RegisterModelForm } from "./RegisterModelForm";

export function RegisterModelModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">
          Register Model
        </h2>
        <RegisterModelForm
          layout="stack"
          showDescription
          onAdded={onCreated}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
