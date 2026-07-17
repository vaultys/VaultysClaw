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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <h2 className="text-base font-semibold text-foreground px-6 pt-6 pb-4 shrink-0">
          Register Model
        </h2>
        <div className="overflow-y-auto px-6 pb-6">
          <RegisterModelForm
            layout="stack"
            showDescription
            onAdded={() => {
              onCreated();
              onClose();
            }}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
