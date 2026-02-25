const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json({
  limit: "2mb",
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a || ""), "hex");
    const bb = Buffer.from(String(b || ""), "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

app.post("/webhook", (req, res) => {
  const secret = process.env.WEBHOOK_SECRET || "";
  const sig = req.header("X-Webhook-Signature") || "";

  const payloadStr = (req.rawBody ? req.rawBody.toString("utf8") : "");
  const expected = crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");

  const ok = secret && timingSafeEqualHex(sig, expected);

  console.log("RECEIVED:", {
    ok,
    got: (sig || "").slice(0, 12),
    exp: (expected || "").slice(0, 12),
    event: req.body?.event_name || req.body?.eventName || req.body?.event || null,
    sessionKey: req.body?.sessionKey || req.body?.payload?.sessionKey || null,
    direction: req.body?.direction || req.body?.payload?.direction || null,
    eventHdr: req.header("X-Webhook-Event") || null,
    deliveryId: req.header("X-Webhook-Delivery-Id") || null,
    tenantHdr: req.header("X-Webhook-Tenant") || null
  });

  if (!ok) return res.status(401).json({ ok: false, error: "invalid signature" });
  return res.json({ ok: true });
});

const port = Number(process.env.PORT || 4010);
app.listen(port, () => console.log("Receiver verify listening on http://localhost:" + port + "/webhook"));
