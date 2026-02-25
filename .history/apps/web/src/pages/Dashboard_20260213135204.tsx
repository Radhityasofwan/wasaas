import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export default function Dashboard() {
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiFetch("/ui/sessions"),
  });

  return (
    <div>
      <div className="text-xl font-semibold">Dashboard</div>
      <div className="mt-2 text-sm opacity-70">Ringkas status sistem.</div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs opacity-70">Sessions</div>
          <div className="mt-1 text-2xl font-semibold">{sessions.data?.sessions?.length ?? "-"}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs opacity-70">Worker</div>
          <div className="mt-1 text-2xl font-semibold">{import.meta.env.VITE_WORKERS || "env"}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs opacity-70">API</div>
          <div className="mt-1 text-2xl font-semibold">Connected</div>
        </div>
      </div>
    </div>
  );
}
