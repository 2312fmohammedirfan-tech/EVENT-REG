let db;
let isAdmin = false;

// Using version 2 to ensure schema triggers if needed, though we check objectStoreNames manually
const request = indexedDB.open("RestaurantDB", 2); 

request.onupgradeneeded = function(event){
    db = event.target.result;

    if (!db.objectStoreNames.contains("menu")) {
        db.createObjectStore("menu", { keyPath: "id", autoIncrement: true });
    }
    if (!db.objectStoreNames.contains("orders")) {
        db.createObjectStore("orders", { keyPath: "id", autoIncrement: true });
    }
    if (!db.objectStoreNames.contains("reservations")) {
        db.createObjectStore("reservations", { keyPath: "id", autoIncrement: true });
    }
};

request.onsuccess = function(event){
    db = event.target.result;
    checkAdminState(); // Automatically set UI based on session
    loadMenu();
    loadOrders();
    loadReservations();
    generateReport();
};

request.onerror = function(){
    console.log("DB Error");
};

// --- Dark Mode Feature ---
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
}

// --- Admin Features ---
function checkAdminState() {
    isAdmin = sessionStorage.getItem('isAdmin') === 'true';
    updateAdminUI();
}

function updateAdminUI() {
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
        el.style.display = isAdmin ? 'block' : 'none';
    });
    
    const loginBtn = document.getElementById('adminLoginBtn');
    if(isAdmin) {
        loginBtn.innerText = "Admin Logout";
        loginBtn.classList.add("danger-btn");
    } else {
        loginBtn.innerText = "Admin Login";
        loginBtn.classList.remove("danger-btn");
    }
    
    // Refresh lists to show/hide admin buttons within cards
    loadMenu();
    loadOrders();
    loadReservations();
}

function toggleAdminLogin() {
    if (isAdmin) {
        sessionStorage.setItem('isAdmin', 'false');
        isAdmin = false;
        updateAdminUI();
    } else {
        document.getElementById('loginModal').style.display = 'block';
    }
}

function loginAdmin() {
    const pass = document.getElementById('adminPassword').value;
    if (pass === 'admin') {
        sessionStorage.setItem('isAdmin', 'true');
        isAdmin = true;
        document.getElementById('adminPassword').value = "";
        closeModal();
        updateAdminUI();
    } else {
        alert("Incorrect Password! Hint: it is 'admin'");
    }
}

function closeModal() {
    document.getElementById('loginModal').style.display = 'none';
}

// --- Menu Features ---
function addMenuItem(){
    const name = document.getElementById("itemName").value;
    const price = Number(document.getElementById("itemPrice").value);
    const stock = Number(document.getElementById("itemStock").value);

    if(!name || !price || !stock) return alert("Please fill all fields");

    const transaction = db.transaction(["menu"], "readwrite");
    const store = transaction.objectStore("menu");

    store.add({ name, price, stock });

    transaction.oncomplete = ()=>{
        document.getElementById("itemName").value = "";
        document.getElementById("itemPrice").value = "";
        document.getElementById("itemStock").value = "";
        loadMenu();
    };
}

function loadMenu(searchQuery = ""){
    const menuList = document.getElementById("menuList");
    menuList.innerHTML = "";

    const transaction = db.transaction(["menu"],"readonly");
    const store = transaction.objectStore("menu");

    store.openCursor().onsuccess = function(event){
        const cursor = event.target.result;
        if(cursor){
            const item = cursor.value;
            
            // Search feature logic
            if (searchQuery === "" || item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                const div = document.createElement("div");
                div.className = "card";

                let adminButtons = '';
                if(isAdmin) {
                    // Bonus: Edit / Delete Menu Items
                    adminButtons = `
                        <button class="danger-btn" onclick="deleteMenuItem(${item.id})">Delete</button>
                        <button onclick="editMenuItem(${item.id})">Edit</button>
                    `;
                }

                div.innerHTML = `
                    <h3>${item.name}</h3>
                    Price: ₹${item.price}<br>
                    Stock: <span id="stock-${item.id}">${item.stock}</span><br>
                    <div class="card-actions">
                        <button class="success-btn" onclick="placeOrder(${item.id})">Order</button>
                        ${adminButtons}
                    </div>
                `;
                
                if(item.stock <= 5){
                    div.innerHTML += "<br><b style='color:red;'>⚠ Low Stock Alert</b>";
                }

                menuList.appendChild(div);
            }
            cursor.continue();
        }
    };
}

// Search Menu Feature
function searchMenu() {
    const query = document.getElementById("searchInput").value;
    loadMenu(query);
}

// Delete Menu Item Feature
function deleteMenuItem(id) {
    if(confirm("Are you sure you want to delete this item?")) {
        const transaction = db.transaction(["menu"], "readwrite");
        const store = transaction.objectStore("menu");
        store.delete(id);
        transaction.oncomplete = () => loadMenu();
    }
}

// Edit Menu Item Feature
function editMenuItem(id) {
    const transaction = db.transaction(["menu"], "readonly");
    const store = transaction.objectStore("menu");
    const request = store.get(id);

    request.onsuccess = function() {
        const item = request.result;
        const newName = prompt("Enter new name:", item.name);
        if(newName === null) return;
        const newPrice = prompt("Enter new price:", item.price);
        if(newPrice === null) return;
        const newStock = prompt("Enter new stock:", item.stock);
        if(newStock === null) return;

        if(newName && newPrice && newStock) {
            const updateTx = db.transaction(["menu"], "readwrite");
            const updateStore = updateTx.objectStore("menu");
            item.name = newName;
            item.price = Number(newPrice);
            item.stock = Number(newStock);
            updateStore.put(item);
            updateTx.oncomplete = () => loadMenu();
        }
    }
}

// --- Order Features ---
function placeOrder(menuId){
    const transaction = db.transaction(["menu","orders"], "readwrite");
    const menuStore = transaction.objectStore("menu");
    const orderStore = transaction.objectStore("orders");
    const request = menuStore.get(menuId);

    request.onsuccess = function(){
        let item = request.result;

        if(item.stock <= 0){
            alert("Out of Stock");
            return;
        }

        item.stock--;
        menuStore.put(item);

        const order = {
            itemName: item.name,
            amount: item.price,
            date: new Date().toISOString(),
            status: 'Pending' // Order Status Feature
        };

        orderStore.add(order);

        transaction.oncomplete = () => {
            loadMenu();
            loadOrders();
            generateReport();
            
            // Show Visual Customer Bill Modal
            const gst = (item.price * 0.18).toFixed(2);
            const total = (item.price + Number(gst)).toFixed(2);
            
            document.getElementById("billItemName").innerText = item.name;
            document.getElementById("billItemPrice").innerText = item.price.toFixed(2);
            document.getElementById("billGST").innerText = gst;
            document.getElementById("billTotal").innerText = total;
            
            document.getElementById("billModal").style.display = 'block';
        };
    };
}

function closeBillModal() {
    document.getElementById("billModal").style.display = 'none';
}

function printBill() {
    window.print();
}

function viewOrderBill(itemName, amount) {
    const gst = (amount * 0.18).toFixed(2);
    const total = (amount + Number(gst)).toFixed(2);
    
    document.getElementById("billItemName").innerText = itemName;
    document.getElementById("billItemPrice").innerText = Number(amount).toFixed(2);
    document.getElementById("billGST").innerText = gst;
    document.getElementById("billTotal").innerText = total;
    
    document.getElementById("billModal").style.display = 'block';
}

function loadOrders(){
    const orderList = document.getElementById("orderList");
    orderList.innerHTML="";

    const transaction = db.transaction(["orders"], "readonly");
    const store = transaction.objectStore("orders");

    store.openCursor().onsuccess = function(event){
        const cursor = event.target.result;
        if(cursor){
            const order = cursor.value;
            const div = document.createElement("div");
            div.className = "card";

            let adminButtons = '';
            if(isAdmin) {
                if(order.status === 'Pending') {
                    // Admin can mark order as completed
                    adminButtons += `<button class="success-btn" onclick="completeOrder(${order.id})">Mark Completed</button>`;
                }
                // Admin can view and print the bill for any order
                adminButtons += `<button onclick="viewOrderBill('${order.itemName.replace(/'/g, "\\'")}', ${order.amount})">View Bill</button>`;
            }

            // Show GST in the order listing as well
            const gst = (order.amount * 0.18).toFixed(2);
            const total = (order.amount + Number(gst)).toFixed(2);

            div.innerHTML = `
                <strong>${order.itemName}</strong><br>
                Status: <b>${order.status}</b><br>
                Base: ₹${order.amount} | GST: ₹${gst} | <b>Total: ₹${total}</b>
                <div class="card-actions">
                    ${adminButtons}
                </div>
            `;

            orderList.appendChild(div);
            cursor.continue();
        }
    };
}

function completeOrder(id) {
    const tx = db.transaction(["orders"], "readwrite");
    const store = tx.objectStore("orders");
    const request = store.get(id);

    request.onsuccess = function() {
        const order = request.result;
        order.status = "Completed";
        store.put(order);
        tx.oncomplete = () => loadOrders();
    };
}

// --- Reservation Features ---
function reserveTable(){
    const customer = document.getElementById("customerName").value;
    const tableNo = document.getElementById("tableNumber").value;

    if(!customer || !tableNo) return alert("Please fill all fields");

    const transaction = db.transaction(["reservations"], "readwrite");
    const store = transaction.objectStore("reservations");

    store.add({ customer, tableNo });

    transaction.oncomplete = ()=>{
        document.getElementById("customerName").value = "";
        document.getElementById("tableNumber").value = "";
        loadReservations();
    };
}

function loadReservations(){
    const list = document.getElementById("reservationList");
    list.innerHTML="";

    const transaction = db.transaction(["reservations"], "readonly");
    const store = transaction.objectStore("reservations");

    store.openCursor().onsuccess = function(event){
        const cursor = event.target.result;
        if(cursor){
            const res = cursor.value;
            const div = document.createElement("div");
            div.className = "card";

            let adminButtons = '';
            if(isAdmin) {
                // Cancel Reservation Feature
                adminButtons = `<button class="danger-btn" onclick="cancelReservation(${res.id})">Cancel</button>`;
            }

            div.innerHTML = `
                ${res.customer} - Table ${res.tableNo}
                <div class="card-actions">${adminButtons}</div>
            `;

            list.appendChild(div);
            cursor.continue();
        }
    };
}

function cancelReservation(id) {
    if(confirm("Cancel this reservation?")) {
        const tx = db.transaction(["reservations"], "readwrite");
        const store = tx.objectStore("reservations");
        store.delete(id);
        tx.oncomplete = () => loadReservations();
    }
}

// --- Report Features ---
function generateReport(){
    let totalBase = 0;
    const transaction = db.transaction(["orders"], "readonly");
    const store = transaction.objectStore("orders");

    store.openCursor().onsuccess = function(event){
        const cursor = event.target.result;
        if(cursor){
            totalBase += Number(cursor.value.amount);
            cursor.continue();
        } else {
            const gst = totalBase * 0.18;
            const finalTotal = totalBase + gst;
            document.getElementById("salesReport").innerHTML = `
                <p>Base Sales: ₹${totalBase.toFixed(2)}</p>
                <p>Total GST (18%): ₹${gst.toFixed(2)}</p>
                <h3>Gross Revenue: ₹${finalTotal.toFixed(2)}</h3>
            `;
        }
    };
}

// Export Sales Report PDF Feature
function exportReportPDF() {
    const element = document.getElementById('salesReportSection');
    // Hide the export button temporarily for the PDF snapshot
    const btn = element.querySelector('button');
    btn.style.display = 'none';
    
    html2pdf().from(element).save('Restaurant_Sales_Report.pdf').then(() => {
        // Restore button visibility
        btn.style.display = 'inline-block';
    });
}
