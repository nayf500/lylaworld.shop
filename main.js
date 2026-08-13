// main.js — دوال مشتركة لعرض بطاقات المنتجات
function productCardHTML(p) {
  const outOfStock = p.stock <= 0;
  return `
    <div class="card">
      <a class="stretched" href="/product.html?id=${p.id}">
        <div class="card-img ${p.color}">
          ${p.featured ? '<span class="tag">مميز</span>' : ""}
          <div class="mini-watch"></div>
        </div>
        <div class="card-body">
          <div class="c">${p.category}</div>
          <h4>${p.name}</h4>
          <div class="p">${p.price.toFixed(0)} ر.س</div>
          ${outOfStock ? '<div class="out">غير متوفر حالياً</div>' : ""}
        </div>
      </a>
    </div>
  `;
}

async function fetchProducts(category) {
  const url = category ? `/api/products?category=${encodeURIComponent(category)}` : "/api/products";
  const res = await fetch(url);
  return res.json();
}
