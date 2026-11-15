"use client";
import { AlertTriangle } from "lucide-react";

/** Route-level error boundary: a rendering failure in the graph never blanks the rest of Signal Lab. */
export default function EcosystemError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-24 max-w-lg rounded-2xl p-8 text-center glass">
      <AlertTriangle className="mx-auto text-amber-300" />
      <h2 className="mt-3 text-lg font-semibold">The ecosystem graph hit an error</h2>
      <p className="mt-2 text-sm text-white/55">{error.message}</p>
      <button onClick={reset} className="mt-5 rounded-xl bg-faze-red px-5 py-2 text-sm font-medium">Try again</button>
    </div>
  );
}
