import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Login from "./pages/Login";
import Sessions from "./pages/Sessions";
import Inbox from "./pages/Inbox";
import Webhooks from "./pages/Webhooks";
import Broadcast from "./pages/Broadcast";
import Leads from "./pages/Leads"; // Import halaman baru
import ApiKeys from "./pages/ApiKeys";
import Admin from "./pages/Admin";
import Docs from "./pages/Docs";
import { clearApiKey, getApiKey } from "./lib/api";

function RequireKey({ children }: { children: any }) {
  const key = getApiKey();
  if (!key) return <Navigate to="/login" replace />;
  return children;
}

function Shell({ children }: { children: any }) {
  const nav = useNavigate();
  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: "260px 1fr", background: "#0b141a", color: "#e9edef" }}>
      <aside style={{ borderRight: "1px solid #1f2c33", padding: 14, background: "#111b21" }}>
        <div style={{ fontWeight: 800, marginBottom: 14 }}>WA SaaS</div>

        <nav style={{ display: "grid", gap: 8 }}>
          <Link style={navLink} to="/">Inbox</Link>
          <Link style={navLink} to="/sessions">Sessions</Link>
          <Link style={navLink} to="/broadcast">Broadcast</Link>
          <Link style={navLink} to="/leads">Leads (Prospects)</Link> {/* MENU BARU */}
          <Link style={navLink} to="/api-keys">API Keys</Link>
          <Link style={navLink} to="/webhooks">Webhooks</Link>
          <Link style={navLink} to="/admin">Admin</Link>
          <Link style={navLink} to="/docs">API Docs</Link>
        </nav>

        <button
          onClick={() => { clearApiKey(); nav("/login"); }}
          style={{ marginTop: 16, width: "100%", padding: 10, borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" }}
        >
          Logout
        </button>
      </aside>

      <main style={{ padding: 14, overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}

const navLink: React.CSSProperties = {
  display: "block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  color: "#e9edef",
  border: "1px solid #1f2c33",
  background: "#0b141a",
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <RequireKey>
          <Shell>
            <Routes>
              <Route path="/" element={<Inbox />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/broadcast" element={<Broadcast />} />
              <Route path="/leads" element={<Leads />} /> {/* ROUTE BARU */}
              <Route path="/api-keys" element={<ApiKeys />} />
              <Route path="/webhooks" element={<Webhooks />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/docs" element={<Docs />} />
            </Routes>
          </Shell>
        </RequireKey>
      } />
    </Routes>
  );
}