import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { fmtDate } from "../lib/fmt";

type LeadRow = {
  to_number: string;
  total_broadcasts: number;
  last_sent_at: string;
  last_reply_at: string | null;
  has_replied: number; // 1 or 0
  reply_preview: string | null;
};

export default function Leads() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all"); // all, replied, pending

  async function loadData() {
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/leads?limit=100&filter=${filter}`);
      setLeads(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [filter]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Leads / Prospects</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)} 
            style={selectStyle}
          >
            <option value="all">Semua Status</option>
            <option value="replied">🔥 Hot Leads (Sudah Balas)</option>
            <option value="pending">❄️ Cold Leads (Belum Balas)</option>
          </select>
          <button style={btnStyle} onClick={loadData}>Refresh</button>
        </div>
      </div>

      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#0b141a", borderBottom: "2px solid #1f2c33" }}>
              <th style={thStyle}>Nomor WhatsApp</th>
              <th style={thStyle}>Klasifikasi</th>
              <th style={thStyle}>Total Broadcast</th>
              <th style={thStyle}>Interaksi Terakhir</th>
              <th style={thStyle}>Balasan Terakhir</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#888" }}>Loading leads...</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#888" }}>Belum ada data leads.</td></tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.to_number} style={{ borderBottom: "1px solid #1f2c33" }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: "bold", fontFamily: "monospace", fontSize: 13 }}>{lead.to_number}</div>
                  </td>
                  <td style={tdStyle}>
                    {lead.has_replied ? (
                      <span style={badgeHot}>🔥 HOT LEAD</span>
                    ) : (
                      <span style={badgeCold}>❄️ COLD LEAD</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ textAlign: "center", background: "#202c33", padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>
                      {lead.total_broadcasts}x
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {lead.last_reply_at ? (
                        <span style={{ color: "#53bdeb" }}>Balas: {fmtDate(lead.last_reply_at)}</span>
                      ) : (
                        <span>Kirim: {fmtDate(lead.last_sent_at)}</span>
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {lead.reply_preview ? (
                      <div style={{ fontStyle: "italic", opacity: 0.8, maxWidth: 250, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        "{lead.reply_preview}"
                      </div>
                    ) : (
                      <span style={{ opacity: 0.3 }}>-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Styles
const cardStyle: React.CSSProperties = { background: "#111b21", borderRadius: 12, border: "1px solid #1f2c33", overflow: "hidden" };
const thStyle: React.CSSProperties = { padding: 14, textAlign: "left", opacity: 0.7, fontSize: 12, textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: 14 };
const selectStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, background: "#202c33", color: "#e9edef", border: "1px solid #1f2c33", cursor: "pointer" };
const btnStyle: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, background: "#00a884", color: "#001a12", fontWeight: "bold", border: "none", cursor: "pointer" };

const badgeHot: React.CSSProperties = { background: "rgba(255, 107, 107, 0.2)", color: "#ff6b6b", padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: "bold", border: "1px solid rgba(255, 107, 107, 0.3)" };
const badgeCold: React.CSSProperties = { background: "rgba(134, 150, 160, 0.2)", color: "#8696a0", padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: "bold" };