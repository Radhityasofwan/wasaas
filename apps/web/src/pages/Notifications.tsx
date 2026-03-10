export default function Notifications() {
  return (
    <div>
      <div className="text-xl font-semibold">Notifications</div>
      <div className="mt-2 text-sm opacity-70">
        Browser push notifikasi sudah aktif melalui PWA subscription berbasis VAPID untuk event inbox, session, broadcast, follow up, dan leads.
      </div>
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
        Pastikan user memberikan izin notifikasi browser agar notifikasi dapat tampil di layar atas HP/desktop.
      </div>
    </div>
  );
}
