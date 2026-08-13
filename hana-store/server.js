// server.js — خادم المتجر (بدون أي مكتبات خارجية)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  getProducts, getProduct, createProduct, updateProduct, deleteProduct,
  createOrder, getOrder, getOrders, setOrderPaymentStatus,
  createAdminSession, isValidAdminSession,
} from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = process.env.PORT || 3000;

// ---------- تحميل متغيرات البيئة من ملف .env (بدون مكتبات) ----------
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const MOYASAR_PUBLISHABLE_KEY = process.env.MOYASAR_PUBLISHABLE_KEY || "";
const MOYASAR_SECRET_KEY = process.env.MOYASAR_SECRET_KEY || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

// ---------- أدوات مساعدة ----------
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("JSON غير صالح"));
      }
    });
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const [k, ...v] = pair.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  });
  return out;
}

function requireAdmin(req) {
  const cookies = parseCookies(req);
  return isValidAdminSession(cookies.admin_token);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function serveStatic(req, res, urlPath) {
  let filePath = path.join(PUBLIC_DIR, decodeURIComponent(urlPath));
  if (urlPath === "/") filePath = path.join(PUBLIC_DIR, "index.html");
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("ممنوع");
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      return res.end("<h1>404 — الصفحة غير موجودة</h1>");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

// ---------- الخادم ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    // ===== API: المنتجات =====
    if (pathname === "/api/products" && req.method === "GET") {
      const category = url.searchParams.get("category");
      return sendJson(res, 200, getProducts({ category }));
    }

    if (pathname.match(/^\/api\/products\/\d+$/) && req.method === "GET") {
      const id = Number(pathname.split("/").pop());
      const product = getProduct(id);
      if (!product) return sendJson(res, 404, { error: "المنتج غير موجود" });
      return sendJson(res, 200, product);
    }

    // ===== API: إنشاء الطلب (قبل الدفع) =====
    if (pathname === "/api/checkout" && req.method === "POST") {
      const body = await readBody(req);
      const { customer_name, phone, city, address, items } = body;
      if (!customer_name || !phone || !city || !address || !Array.isArray(items) || items.length === 0) {
        return sendJson(res, 400, { error: "الرجاء تعبئة جميع الحقول واختيار منتجات" });
      }
      const { orderId, total } = createOrder({ customer_name, phone, city, address, items });
      return sendJson(res, 200, {
        order_id: orderId,
        total,
        moyasar_publishable_key: MOYASAR_PUBLISHABLE_KEY,
        callback_url: `${SITE_URL}/api/payment-callback?order_id=${orderId}`,
      });
    }

    // ===== Moyasar: تأكيد الدفع بعد التحويل من صفحة البطاقة =====
    // Moyasar يعيد توجيه المستخدم إلى هذا الرابط مع id و status في الاستعلام
    if (pathname === "/api/payment-callback" && req.method === "GET") {
      const orderId = url.searchParams.get("order_id");
      const paymentId = url.searchParams.get("id");
      const order = getOrder(orderId);

      if (!order || !paymentId || !MOYASAR_SECRET_KEY) {
        setOrderPaymentStatus(orderId, "failed", paymentId);
        res.writeHead(302, { Location: `/thank-you.html?order=${orderId}&status=failed` });
        return res.end();
      }

      // نتحقق من حالة الدفع الحقيقية من سيرفر Moyasar (لا نثق بالباراميتر القادم من المتصفح فقط)
      const auth = Buffer.from(`${MOYASAR_SECRET_KEY}:`).toString("base64");
      const verifyRes = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      const payment = await verifyRes.json();

      if (payment.status === "paid") {
        setOrderPaymentStatus(orderId, "paid", paymentId);
        res.writeHead(302, { Location: `/thank-you.html?order=${orderId}&status=paid` });
      } else {
        setOrderPaymentStatus(orderId, "failed", paymentId);
        res.writeHead(302, { Location: `/thank-you.html?order=${orderId}&status=failed` });
      }
      return res.end();
    }

    if (pathname.match(/^\/api\/orders\/\d+$/) && req.method === "GET") {
      const order = getOrder(Number(pathname.split("/").pop()));
      if (!order) return sendJson(res, 404, { error: "الطلب غير موجود" });
      return sendJson(res, 200, order);
    }

    // ===== API: تسجيل دخول الأدمن =====
    if (pathname === "/api/admin/login" && req.method === "POST") {
      const { password } = await readBody(req);
      if (password !== ADMIN_PASSWORD) {
        return sendJson(res, 401, { error: "كلمة المرور غير صحيحة" });
      }
      const token = crypto.randomBytes(24).toString("hex");
      createAdminSession(token);
      res.setHeader("Set-Cookie", `admin_token=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400`);
      return sendJson(res, 200, { ok: true });
    }

    // ===== كل مسارات /api/admin/* التالية تتطلب تسجيل دخول =====
    if (pathname.startsWith("/api/admin/")) {
      if (!requireAdmin(req)) {
        return sendJson(res, 401, { error: "غير مصرح — الرجاء تسجيل الدخول" });
      }

      if (pathname === "/api/admin/products" && req.method === "GET") {
        return sendJson(res, 200, getProducts());
      }
      if (pathname === "/api/admin/products" && req.method === "POST") {
        const body = await readBody(req);
        return sendJson(res, 200, createProduct(body));
      }
      if (pathname.match(/^\/api\/admin\/products\/\d+$/) && req.method === "PUT") {
        const id = Number(pathname.split("/").pop());
        const body = await readBody(req);
        return sendJson(res, 200, updateProduct(id, body));
      }
      if (pathname.match(/^\/api\/admin\/products\/\d+$/) && req.method === "DELETE") {
        const id = Number(pathname.split("/").pop());
        deleteProduct(id);
        return sendJson(res, 200, { ok: true });
      }
      if (pathname === "/api/admin/orders" && req.method === "GET") {
        return sendJson(res, 200, getOrders());
      }
      return sendJson(res, 404, { error: "غير موجود" });
    }

    // ===== ملفات الواجهة الثابتة =====
    if (req.method === "GET") {
      return serveStatic(req, res, pathname);
    }

    sendJson(res, 404, { error: "غير موجود" });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: "خطأ في الخادم", details: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`✔ متجر عالم ليلى يعمل على ${SITE_URL}`);
  console.log(`  لوحة التحكم: ${SITE_URL}/admin/login.html`);
  if (!MOYASAR_SECRET_KEY) {
    console.log("⚠ لم يتم ضبط MOYASAR_SECRET_KEY / MOYASAR_PUBLISHABLE_KEY في ملف .env — الدفع لن يعمل حتى تضيفهما.");
  }
});
