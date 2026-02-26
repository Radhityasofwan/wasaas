import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { getApiKey, setApiKey } from "../lib/api";

const Item = ({ to, label }: { to: string; label: string }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `block rounded px-3 py-2 text-sm ${isActive ? "bg-white/10" : "hover:bg-white/5"}`
    }
  >
    {label}
  </NavLink>
);

export default function Shell() {
  const nav = useNavigate();
  const key = getApiKey();

  return (
    <div className="h-full bg-[#0b141a] text-white">
      <div className="mx-auto grid h-full max-w-7xl grid-cols-[260px_1fr]">
        <aside className="border-r border-white/10 p-4">
          <div className="mb-4">
            <div className="text-lg font-semibold">WA SaaS</div>
            <div className="text-xs opacity-70">Admin + Chat UI (PWA)</div>
          </div>

          {!key ? (
            <button
              className="mb-4 w-full rounded bg-emerald-500 px-3 py-2 text-sm font-medium text-black"
              onClick={() => nav("/login")}
            >
              Set API Key
            </button>
          ) : (
            <button
              className="mb-4 w-full rounded bg-white/10 px-3 py-2 text-sm"
              onClick={() => {
                setApiKey("");
                nav("/login");
              }}
            >
              Logout (clear key)
            </button>
          )}

          <div className="space-y-1">
            <Item to="/" label="Dashboard" />
            <Item to="/sessions" label="Sessions (Multi device)" />
            <Item to="/inbox" label="Inbox (Chat UI)" />
            <Item to="/broadcast" label="Broadcast / Blast" />
            <Item to="/api-keys" label="API Keys" />
            <Item to="/webhooks" label="Webhooks" />
            <Item to="/limits" label="Limits" />
            <Item to="/plans" label="Plans" />
            <Item to="/payments" label="Payments" />
            <Item to="/notifications" label="Notifications" />
            <Item to="/docs" label="API Docs" />
          </div>
        </aside>

        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
