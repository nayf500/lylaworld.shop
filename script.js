console.log("مرحباً بك في موقع عالم ليلى!");
let cart = [];

function addToCart(name, price) {
    cart.push({ name, price });
    updateCartUI();
    alert("تمت إضافة " + name + " للسلة!");
}

function updateCartUI() {
    document.getElementById('cart-icon').innerText = "🛒 (" + cart.length + ")";
}

function toggleCart() {
    document.getElementById('cart-modal').classList.toggle('hidden');
}

function checkout() {
    let message = "أهلاً عالم ليلى، أريد طلب المنتجات التالية:%0A";
    cart.forEach(item => { message += "- " + item.name + " (" + item.price + ")%0A"; });
    window.open("https://wa.me/9665XXXXXXXX?text=" + message); // ضع رقم جوالك هنا
}
let cart = [];

const productGrid = document.getElementById('products');

function loadStoreProducts() {
    if (!productGrid) return;
    productGrid.innerHTML = "";
    
    storeProducts.forEach(product => {
        productGrid.innerHTML += `
            <div class="product-card">
                <img src="${product.image}" alt="${product.name}">
                <h3>${product.name}</h3>
                <p class="product-sku">الرقم التعريفي: ${product.id}</p>
                <div class="price">${product.price}</div>
                <button onclick="addToCart('${product.name}', '${product.price}')">إضافة للسلة</button>
            </div>
        `;
    });
}

function addToCart(name, price) {
    cart.push({ name, price });
    updateCartUI();
    alert("تمت إضافة " + name + " إلى السلة بنجاح!");
}

function updateCartUI() {
    const cartIcon = document.getElementById('cart-icon');
    if (cartIcon) {
        cartIcon.innerText = "🛒 (" + cart.length + ")";
    }
}

function toggleCart() {
    const modal = document.getElementById('cart-modal');
    if (modal) {
        modal.classList.toggle('hidden');
    }
}

function checkout() {
    if (cart.length === 0) {
        alert("السلة فارغة!");
        return;
    }
    let message = "أهلاً عالم ليلى، أريد طلب المنتجات التالية:%0A";
    cart.forEach(item => { 
        message += "- " + item.name + " (" + item.price + ")%0A"; 
    });
    window.open("https://wa.me/9665XXXXXXXX?text=" + message);
}

// تشغيل الدالة عند تحميل الصفحة
window.onload = function() {
    loadStoreProducts();
};
