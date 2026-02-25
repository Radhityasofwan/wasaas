export default function Notifications() {
  return (
    <div>
      <div className="text-xl font-semibold">Notifications</div>
      <div className="mt-2 text-sm opacity-70">
        PWA push notifications (chat masuk). Untuk jalan sempurna butuh JWT (bukan API key via header) + endpoint /push/subscribe.
      </div>
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
        Next step: implement Web Push subscription + worker send push on incoming message.
      </div>
    </div>
  );
}
