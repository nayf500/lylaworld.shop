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
