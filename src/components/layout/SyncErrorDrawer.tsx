"use client";

import { X } from "lucide-react";
import type { PendingMutation } from "@/lib/offline/db";

type Props = {
  errors: PendingMutation[];
  open: boolean;
  onClose: () => void;
  onDismissAll: () => void;
};

export function SyncErrorDrawer({ errors, open, onClose, onDismissAll }: Props) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.10)] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-black/[0.06]">
          <h2 className="text-base font-medium tracking-[-0.02em]">Sync errors</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-gray-900 transition-colors">
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {errors.length === 0 ? (
            <p className="text-sm font-light text-muted-foreground py-4 text-center">No errors</p>
          ) : (
            errors.map((m) => (
              <div key={m.id} className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-900">{m.label}</p>
                <p className="mt-0.5 text-xs font-light text-rose-600">{m.errorMessage}</p>
              </div>
            ))
          )}
        </div>

        {errors.length > 0 && (
          <div className="px-5 py-4 border-t border-black/[0.06]">
            <button
              onClick={() => { onDismissAll(); onClose(); }}
              className="w-full rounded-xl bg-rose-50 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-100 transition-colors"
            >
              Dismiss all
            </button>
          </div>
        )}
      </div>
    </>
  );
}
