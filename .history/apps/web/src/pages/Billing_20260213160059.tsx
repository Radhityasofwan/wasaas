import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

const TENANT_ID = 1;

export default function Billing() {
  const [plans, setPlans] = useState<any[]>([]);
  const [sub, setSub] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [err, setErr] = useState<string>("");

  const [planForm, setPlanForm] = useState<any>({
    code: "basic",
    name: "Basic",
    price_monthly: 0,
    currency: "IDR",
    limit_sessions: 1,
    limit_messages_daily: 50,
    limit_broadcast_daily: 1,
    limit_contacts: 1000,
    feature_api: 1,
    feature_webhook: 1,
    feature_inbox: 1,
    feature_broadcast: 1,
    feature_media: 1,
    is_active: 1,
  });

  const [subPlanId, setSubPlanId] = useState<number>(0);
  const [payForm, setPayForm] = useState<any>({
    subscription_id: null,
    provider: "manual",
    provider_ref: "",
    amount: 0,
    currency: "IDR",
    status: "pending",
  });

  async function load() {
    setErr("");
    const p = await apiFetch<any>("/api/admin/plans");
    const s = await apiFetch<any>(`/api/admin/tenants/${TENANT_ID}/subscription`);
    const pay = await apiFetch<any>(`/api/admin/tenants/${TENANT_ID}/payments`);
    setPlans(p.plans || []);
    setSub(s.subscription || null);
    setPayments(pay.payments || []);
  }

  useEffect(() => { load().catch((e)=>setErr(e.message)); }, []);

  async function savePlan() {
    try {
      setErr("");
      await apiFetch<any>("/api/admin/plans", { method: "POST", body: JSON.stringify(planForm) });
      await load();
    } catch (e:any) { setErr(e.message); }
  }

  async function createSub() {
    try {
      setErr("");
      await apiFetch<any>(`/api/admin/tenants/${TENANT_ID}/subscription`, {
        method: "POST",
        body: JSON.stringify({ plan_id: subPlanId }),
      });
      await load();
    } catch (e:any) { setErr(e.message); }
  }

  async function setSubStatus(status: string) {
    if (!sub?.id) return;
    try {
      setErr("");
      await apiFetch<any>(`/api/admin/tenants/${TENANT_ID}/subscription/${sub.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e:any) { setErr(e.message); }
  }

  async function createPayment() {
    try {
      setErr("");
      const body = { ...payForm };
      if (body.subscription_id === "") body.subscription_id = null;
      await apiFetch<any>(`/api/admin/tenants/${TENANT_ID}/payments`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await load();
    } catch (e:any) { setErr(e.message); }
  }

  async function markPaid(id: number) {
    try {
      setErr("");
      await apiFetch<any>(`/api/admin/tenants/${TENANT_ID}/payments/${id}/mark-paid`, { method: "POST" });
      await load();
    } catch (e:any) { setErr(e.message); }
  }

  return (
    <div style={wrap}>
      <h2 style={{ marginTop: 0 }}>Admin Billing</h2>
      <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 10 }}>
        Tenant: <b>{TENANT_ID}</b> (hardcoded untuk dev)
      </div>
      {err && <div style={{ padding: 10, border: "1px solid #7a2", borderRadius: 10, marginBottom: 10 }}>{err}</div>}

      <section style={card}>
        <h3 style={h3}>Plans</h3>
        <div style={grid}>
          <label style={lab}>Code<input style={inp} value={planForm.code} onChange={(e)=>setPlanForm({ ...planForm, code: e.target.value })} /></label>
          <label style={lab}>Name<input style={inp} value={planForm.name} onChange={(e)=>setPlanForm({ ...planForm, name: e.target.value })} /></label>
          <label style={lab}>Price Monthly<input style={inp} value={planForm.price_monthly} onChange={(e)=>setPlanForm({ ...planForm, price_monthly: Number(e.target.value||0) })} /></label>
          <label style={lab}>Currency<input style={inp} value={planForm.currency} onChange={(e)=>setPlanForm({ ...planForm, currency: e.target.value })} /></label>

          <label style={lab}>Limit Sessions<input style={inp} value={planForm.limit_sessions} onChange={(e)=>setPlanForm({ ...planForm, limit_sessions: Number(e.target.value||0) })} /></label>
          <label style={lab}>Limit Msg Daily<input style={inp} value={planForm.limit_messages_daily} onChange={(e)=>setPlanForm({ ...planForm, limit_messages_daily: Number(e.target.value||0) })} /></label>
          <label style={lab}>Limit Broadcast Daily<input style={inp} value={planForm.limit_broadcast_daily} onChange={(e)=>setPlanForm({ ...planForm, limit_broadcast_daily: Number(e.target.value||0) })} /></label>
          <label style={lab}>Limit Contacts<input style={inp} value={planForm.limit_contacts} onChange={(e)=>setPlanForm({ ...planForm, limit_contacts: Number(e.target.value||0) })} /></label>

          <label style={lab}>Feature API<select style={inp} value={planForm.feature_api} onChange={(e)=>setPlanForm({ ...planForm, feature_api: Number(e.target.value) })}><option value={1}>on</option><option value={0}>off</option></select></label>
          <label style={lab}>Feature Webhook<select style={inp} value={planForm.feature_webhook} onChange={(e)=>setPlanForm({ ...planForm, feature_webhook: Number(e.target.value) })}><option value={1}>on</option><option value={0}>off</option></select></label>
          <label style={lab}>Feature Inbox<select style={inp} value={planForm.feature_inbox} onChange={(e)=>setPlanForm({ ...planForm, feature_inbox: Number(e.target.value) })}><option value={1}>on</option><option value={0}>off</option></select></label>
          <label style={lab}>Feature Broadcast<select style={inp} value={planForm.feature_broadcast} onChange={(e)=>setPlanForm({ ...planForm, feature_broadcast: Number(e.target.value) })}><option value={1}>on</option><option value={0}>off</option></select></label>
          <label style={lab}>Feature Media<select style={inp} value={planForm.feature_media} onChange={(e)=>setPlanForm({ ...planForm, feature_media: Number(e.target.value) })}><option value={1}>on</option><option value={0}>off</option></select></label>

          <label style={lab}>Active<select style={inp} value={planForm.is_active} onChange={(e)=>setPlanForm({ ...planForm, is_active: Number(e.target.value) })}><option value={1}>active</option><option value={0}>inactive</option></select></label>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={btn} onClick={savePlan}>Save Plan</button>
          <button style={btn2} onClick={load}>Reload</button>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead><tr>
              <th>ID</th><th>Code</th><th>Name</th><th>Price</th><th>Sessions</th><th>Msg/day</th><th>Broadcast/day</th><th>Contacts</th><th>Active</th>
            </tr></thead>
            <tbody>
              {plans.map(p=>(
                <tr key={p.id}>
                  <td>{p.id}</td><td>{p.code}</td><td>{p.name}</td><td>{p.price_monthly} {p.currency}</td>
                  <td>{p.limit_sessions}</td><td>{p.limit_messages_daily}</td><td>{p.limit_broadcast_daily}</td><td>{p.limit_contacts}</td><td>{p.is_active}</td>
                </tr>
              ))}
              {!plans.length && <tr><td colSpan={9}>No plans</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section style={card}>
        <h3 style={h3}>Subscription (Tenant {TENANT_ID})</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select style={inp} value={subPlanId} onChange={(e)=>setSubPlanId(Number(e.target.value))}>
            <option value={0}>select plan…</option>
            {plans.filter(p=>p.is_active===1).map(p=>(
              <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
            ))}
          </select>
          <button style={btn} onClick={createSub} disabled={!subPlanId}>Create Subscription</button>
        </div>

        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div><b>Current:</b> {sub ? `#${sub.id} ${sub.status} — ${sub.plan_name || sub.plan_id}` : "none"}</div>
          {sub && (
            <>
              <div>start_at: {sub.start_at} | end_at: {sub.end_at || "-"} | renewal_at: {sub.renewal_at || "-"}</div>
              <div>limits: sessions={sub.limit_sessions}, msg/day={sub.limit_messages_daily}, broadcast/day={sub.limit_broadcast_daily}, contacts={sub.limit_contacts}</div>
              <div style={{ display:"flex", gap:8, marginTop: 8 }}>
                <button style={btn2} onClick={()=>setSubStatus("trial")}>trial</button>
                <button style={btn2} onClick={()=>setSubStatus("active")}>active</button>
                <button style={btn2} onClick={()=>setSubStatus("past_due")}>past_due</button>
                <button style={btn2} onClick={()=>setSubStatus("canceled")}>canceled</button>
                <button style={btn2} onClick={()=>setSubStatus("expired")}>expired</button>
              </div>
            </>
          )}
        </div>
      </section>

      <section style={card}>
        <h3 style={h3}>Payments (Tenant {TENANT_ID})</h3>
        <div style={grid2}>
          <label style={lab}>Subscription ID (optional)
            <input style={inp} value={payForm.subscription_id ?? ""} onChange={(e)=>setPayForm({ ...payForm, subscription_id: e.target.value })} placeholder={sub?.id ? String(sub.id) : ""} />
          </label>
          <label style={lab}>Provider
            <select style={inp} value={payForm.provider} onChange={(e)=>setPayForm({ ...payForm, provider: e.target.value })}>
              <option value="manual">manual</option><option value="midtrans">midtrans</option><option value="xendit">xendit</option><option value="other">other</option>
            </select>
          </label>
          <label style={lab}>Provider Ref<input style={inp} value={payForm.provider_ref} onChange={(e)=>setPayForm({ ...payForm, provider_ref: e.target.value })} /></label>
          <label style={lab}>Amount<input style={inp} value={payForm.amount} onChange={(e)=>setPayForm({ ...payForm, amount: Number(e.target.value||0) })} /></label>
          <label style={lab}>Currency<input style={inp} value={payForm.currency} onChange={(e)=>setPayForm({ ...payForm, currency: e.target.value })} /></label>
          <label style={lab}>Status
            <select style={inp} value={payForm.status} onChange={(e)=>setPayForm({ ...payForm, status: e.target.value })}>
              <option value="pending">pending</option><option value="paid">paid</option><option value="failed">failed</option><option value="refunded">refunded</option><option value="expired">expired</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={btn} onClick={createPayment}>Create Payment</button>
          <button style={btn2} onClick={load}>Reload</button>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead><tr>
              <th>ID</th><th>Sub</th><th>Provider</th><th>Ref</th><th>Amount</th><th>Status</th><th>Paid</th><th>Action</th>
            </tr></thead>
            <tbody>
              {payments.map(p=>(
                <tr key={p.id}>
                  <td>{p.id}</td><td>{p.subscription_id ?? "-"}</td><td>{p.provider}</td><td>{p.provider_ref ?? "-"}</td>
                  <td>{p.amount} {p.currency}</td><td>{p.status}</td><td>{p.paid_at ?? "-"}</td>
                  <td><button style={btn2} onClick={()=>markPaid(p.id)}>mark-paid (dev)</button></td>
                </tr>
              ))}
              {!payments.length && <tr><td colSpan={8}>No payments</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const wrap: React.CSSProperties = { padding: 16, color: "#e9edef" };
const card: React.CSSProperties = { background: "#111b21", border: "1px solid #1f2c33", borderRadius: 14, padding: 12, marginBottom: 12, maxWidth: 1100 };
const h3: React.CSSProperties = { margin: "0 0 10px 0" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 };
const lab: React.CSSProperties = { fontSize: 12, opacity: 0.9, display: "grid", gap: 6 };
const inp: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" };
const btn: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#00a884", color: "#001a12", fontWeight: 900 };
const btn2: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" };
const tableWrap: React.CSSProperties = { marginTop: 10, borderRadius: 12, overflow: "hidden", border: "1px solid #1f2c33" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
