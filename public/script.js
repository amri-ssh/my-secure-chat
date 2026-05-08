const socket = io();
const SECRET_KEY = "chat-master-key-123";
let myUser = null, currentTarget = "Global", isLogin = true;

// --- TYPING ---
let typingTimeout;
document.getElementById("input").oninput = () => {
    if (currentTarget !== "Global") {
        socket.emit("typing", { to: currentTarget, from: myUser.username });
    }
};

socket.on("typing", (data) => {
    if (currentTarget === data.from) {
        document.getElementById("online-status").innerText = "Typing...";
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            document.getElementById("online-status").innerText = "Active Now";
        }, 2000);
    }
});

// --- UI TARGETS ---
function setChatTarget(target) {
    currentTarget = target;
    document.getElementById("target-display").innerText = target === "Global" ? "Global Lobby" : target;
    document.getElementById("messages").innerHTML = "";
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');
}

// --- FILE HANDLING ---
document.getElementById("file-input").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/upload", { method: "POST", body: fd });
    const data = await res.json();
    
    const type = file.type.startsWith("image") ? "image" : "voice";
    sendData(data.url, type);
};

// --- AUTH ---
async function handleAuth() {
    const username = document.getElementById("auth-user").value;
    const password = document.getElementById("auth-pass").value;
    const res = await fetch(isLogin ? "/login" : "/register", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
        myUser = isLogin ? data.user : { username, profilePic: "https://cdn-icons-png.flaticon.com/512/149/149071.png" };
        document.getElementById("auth-screen").style.display = "none";
        socket.emit("join", myUser);
    } else { alert(data.error); }
}

function toggleAuth() {
    isLogin = !isLogin;
    document.getElementById("auth-title").innerText = isLogin ? "Login" : "Register";
    document.getElementById("auth-btn").innerText = isLogin ? "Login" : "Register";
}

// --- MESSAGING ---
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
    if (data.to !== currentTarget && data.from !== currentTarget && currentTarget !== "Global") return;
    if (currentTarget === "Global" && data.to !== "Global") return;

    const li = document.createElement("li");
    const isMe = data.from === myUser.username;
    li.className = `message ${isMe ? 'sent' : 'received'}`;
    
    let msgBody = "";
    if (data.type === "text") {
        try {
            const bytes = CryptoJS.AES.decrypt(data.message, SECRET_KEY);
            msgBody = bytes.toString(CryptoJS.enc.Utf8);
        } catch(e) { msgBody = "🔒 Encrypted Message"; }
    } else if (data.type === "image") {
        msgBody = `<img src="${data.message}" onclick="window.open(this.src)">`;
    } else if (data.type === "voice") {
        msgBody = `<audio controls src="${data.message}"></audio>`;
    }

    li.innerHTML = `<div class="user-name">${data.from}</div><div class="text">${msgBody}</div><div class="meta" style="font-size:10px; opacity:0.6; text-align:right;">${data.time}</div>`;
    document.getElementById("messages").appendChild(li);
    document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
}

socket.on("chat message", appendMessage);
socket.on("chat history", h => h.forEach(appendMessage));
socket.on("user list", users => {
    const ul = document.getElementById("users");
    ul.innerHTML = `<li class="user-item ${currentTarget === 'Global' ? 'active' : ''}" onclick="setChatTarget('Global')">🌍 Global Lobby</li>`;
    for (let u in users) {
        if (u !== myUser.username) {
            ul.innerHTML += `<li class="user-item ${currentTarget === u ? 'active' : ''}" onclick="setChatTarget('${u}')"><img src="${users[u].pic}" class="user-avatar"><span>${u}</span></li>`;
        }
    }
});