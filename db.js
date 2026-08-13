// db.js — طبقة قاعدة البيانات
// يستخدم node:sqlite المدمجة في Node.js (لا يحتاج أي تثبيت خارجي)
// يتطلب Node.js نسخة 22.5 أو أحدث

import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const db = new DatabaseSync(path.join(__dirname, "store.sqlite"));

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT 'blush',
    stock INTEGER DEFAULT 10,
    featured INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',      -- pending | paid | failed
    moyasar_payment_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// بذر بيانات أولية إذا كان الجدول فارغاً
const count = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO products (name, category, price, description, color, stock, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const seed = [
    ["روزا", "ذهبي", 390, "ساعة نسائية بسوار ذهبي رفيع وميناء لؤلؤي، مثالية للإطلالات اليومية.", "gold", 14, 1],
    ["لونا", "فضي", 360, "تصميم بسيط بسوار فولاذي فضي وميناء أبيض ناصع.", "silver", 20, 1],
    ["ميرا", "وردي", 310, "سوار جلدي وردي ناعم مع ميناء ذهبي صغير، خفيفة على المعصم.", "pink", 18, 1],
    ["نور", "ذهبي", 410, "سوار شبكي ذهبي فاخر مناسب للمناسبات.", "gold", 9, 1],
    ["سيلين", "فضي", 340, "ميناء دائري كلاسيكي وسوار ميلانو فضي.", "silver", 12, 0],
    ["ياسمين", "وردي", 295, "تصميم أنيق بلمسة وردية ناعمة، مقاس صغير.", "pink", 25, 0],
    ["إيلا", "ذهبي", 450, "ساعة فاخرة بإطار مرصع وسوار جلدي بني.", "gold", 7, 0],
    ["سارة", "فضي", 330, "سوار شبكي فضي رفيع، عملية وأنيقة.", "silver", 16, 0],
  ];
  for (const p of seed) insert.run(...p);
  console.log("✔ تم إدخال بيانات المنتجات الأولية");
}

export function getProducts({ category } = {}) {
  if (category) {
    return db.prepare("SELECT * FROM products WHERE category = ? ORDER BY id DESC").all(category);
  }
  return db.prepare("SELECT * FROM products ORDER BY id DESC").all();
}

export function getProduct(id) {
  return db.prepare("SELECT * FROM products WHERE id = ?").get(id);
}

export function createProduct(p) {
  const stmt = db.prepare(`
    INSERT INTO products (name, category, price, description, color, stock, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(p.name, p.category, p.price, p.description || "", p.color || "blush", p.stock ?? 10, p.featured ? 1 : 0);
  return getProduct(Number(info.lastInsertRowid));
}

export function updateProduct(id, p) {
  db.prepare(`
    UPDATE products SET name=?, category=?, price=?, description=?, color=?, stock=?, featured=?
    WHERE id=?
  `).run(p.name, p.category, p.price, p.description || "", p.color || "blush", p.stock ?? 10, p.featured ? 1 : 0, id);
  return getProduct(id);
}

export function deleteProduct(id) {
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
}

export function createOrder({ customer_name, phone, city, address, items }) {
  // نحسب السعر من قاعدة البيانات دائماً (لا نثق بسعر يرسله المتصفح)
  let total = 0;
  const resolvedItems = items.map((it) => {
    const product = getProduct(it.product_id);
    if (!product) throw new Error(`المنتج ${it.product_id} غير موجود`);
    const qty = Math.max(1, Number(it.qty) || 1);
    total += product.price * qty;
    return { product, qty };
  });

  const orderStmt = db.prepare(`
    INSERT INTO orders (customer_name, phone, city, address, total, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);
  const info = orderStmt.run(customer_name, phone, city, address, total);
  const orderId = Number(info.lastInsertRowid);

  const itemStmt = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, qty, price)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const { product, qty } of resolvedItems) {
    itemStmt.run(orderId, product.id, product.name, qty, product.price);
  }

  return { orderId, total };
}

export function getOrder(id) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  if (!order) return null;
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(id);
  return { ...order, items };
}

export function getOrders() {
  return db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
}

export function setOrderPaymentStatus(id, status, moyasarPaymentId) {
  db.prepare("UPDATE orders SET status = ?, moyasar_payment_id = ? WHERE id = ?").run(status, moyasarPaymentId || null, id);
}

// جلسات الأدمن
export function createAdminSession(token) {
  db.prepare("INSERT INTO admin_sessions (token) VALUES (?)").run(token);
}
export function isValidAdminSession(token) {
  if (!token) return false;
  return !!db.prepare("SELECT 1 FROM admin_sessions WHERE token = ?").get(token);
}
