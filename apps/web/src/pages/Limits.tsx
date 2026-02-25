export default function Limits() {
  return (
    <div>
      <div className="text-xl font-semibold">Limits</div>
      <div className="mt-2 text-sm opacity-70">
        UI untuk atur limit sesi & limit pesan per tenant.
      </div>
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
        Endpoint update limits belum dibuat di API. Next step: tambah:
        <div className="mt-2 text-xs opacity-70">
          GET /admin/tenant/limits · POST /admin/tenant/limits
        </div>
      </div>
    </div>
  );
}
