const socket = io();
const SECRET_KEY = "chat-master-key-123";
let myUser = null, currentTarget = "Global", isLogin = true;

function setChatTarget(target) {
    currentTarget = target;
    document.getElementById("target-display").innerText = target === "Global" ? "Global Lobby" : `Chatting with ${target}`;
    document.getElementById("messages").innerHTML = ""; // Clear for new target history (Optional: load from DB)
    
    // UI highlight for sidebar
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
}

// Auth & Socket logic
async function handleAuth() {
    const username = document.getElementById("auth-user").value;
    const password = document.getElementById("auth-pass").value;
    const res = await fetch(isLogin ? "/login" : "/register", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
        myUser = isLogin ? data.user : { username };
        document.getElementById("auth-screen").style.display = "none";
        socket.emit("join", myUser);
    } else { alert(data.error); }
}

function toggleAuth() {
    isLogin = !isLogin;
    document.getElementById("auth-title").innerText = isLogin ? "Login" : "Register";
    document.getElementById("auth-btn").innerText = isLogin ? "Login" : "Register";
}

const sendData = (msg, type = "text") => {
    const content = type === "text" ? CryptoJS.AES.encrypt(msg, SECRET_KEY).toString() : msg;
    socket.emit("chat message", { from: myUser.username, to: currentTarget, message: content, type });
};

document.getElementById("form").onsubmit = (e) => {
    e.preventDefault();
    const val = document.getElementById("input").value;
    if (val) { sendData(val); document.getElementById("input").value = ""; }
};

function appendMessage(data) {
    // Show only if message belongs to current chat or is Global
    if (data.to !== currentTarget && data.from !== currentTarget && currentTarget !== "Global") return;
    if (currentTarget === "Global" && data.to !== "Global") return;

    const li = document.createElement("li");
    const isMe = data.from === myUser.username;
    li.className = `message ${isMe ? 'sent' : 'received'}`;
    
    let msgBody = data.message;
    if (data.type === "text") {
        try {
            const bytes = CryptoJS.AES.decrypt(data.message, SECRET_KEY);
            msgBody = bytes.toString(CryptoJS.enc.Utf8);
        } catch(e) { msgBody = "🔒 Encrypted"; }
    }

    li.innerHTML = `<div class="user-name">${data.from}</div><div class="text">${msgBody}</div><div class="meta">${data.time}</div>`;
    document.getElementById("messages").appendChild(li);
    document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
}

socket.on("chat message", appendMessage);
socket.on("chat history", h => h.forEach(appendMessage));
socket.on("user list", users => {
    const ul = document.getElementById("users");
    ul.innerHTML = `<li class="user-item ${currentTarget === 'Global' ? 'active' : ''}" onclick="setChatTarget('Global')">🌍 Global Lobby</li>`;
    users.forEach(u => {
        if (u !== myUser.username) {
            ul.innerHTML += `<li class="user-item ${currentTarget === u ? 'active' : ''}" onclick="setChatTarget('${u}')">👤 ${u}</li>`;
        }
    });
});