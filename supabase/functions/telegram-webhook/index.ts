import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Set RAILWAY_URL di Supabase Project Secrets
const RAILWAY_URL = Deno.env.get("RAILWAY_URL") ?? "https://your-app.up.railway.app";
const TARGET_WEBHOOK = `${RAILWAY_URL}/webhook`;

serve(async (req) => {
  // Hanya proses metode POST dari Telegram
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const rawBody = await req.text();
    console.log(`[PROXY] Menerima update Telegram, meneruskan ke: ${TARGET_WEBHOOK}`);

    // Jika Railway sedang 'tidur' (Cold Start), fetch ini akan pending ~5-10 detik.
    // Edge Function Supabase (Deno) memiliki timeout panjang (hingga 60+ detik),
    // sehingga aman menunggu Railway bangun.
    // Telegram mentoleransi delay hingga ~20-30 detik sebelum retry.
    const railwayResponse = await fetch(TARGET_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: rawBody,
    });

    const responseText = await railwayResponse.text();
    console.log(
      `[PROXY] Respons Railway (${railwayResponse.status}):`,
      responseText
    );

    // Kembalikan 200 OK ke Telegram — agar tidak di-retry
    return new Response(JSON.stringify({ ok: true, proxy: "supabase-edge" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[PROXY] Gagal meneruskan Webhook ke Railway:", error);

    // Jika Railway benar-benar offline (timeout >60 detik)
    return new Response(
      JSON.stringify({ ok: false, error: "Gateway Timeout" }),
      {
        headers: { "Content-Type": "application/json" },
        status: 504,
      }
    );
  }
});
