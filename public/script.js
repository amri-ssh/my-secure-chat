const socket = io();
const SECRET_KEY = "chat-master-key-123";
let isLogin = true, myUser = null, mediaRecorder, audioChunks = [];

const authScreen = document.getElementById("auth-screen");
const micBtn = document.getElementById("mic-btn");
const recordStatus = document.getElementById("record-status");
const messagesList = document.getElementById("messages");

// --- AUTH LOGIC ---
function toggleAuth() {
    isLogin = !isLogin;
    document.getElementById("auth-title").innerText = isLogin ? "Login" : "Register";
    document.getElementById("auth-btn").innerText = isLogin ? "Login" : "Register";
    document.getElementById("toggle-text").innerText = isLogin ? "New here? Create Account" : "Already have account? Login";
}

async function handleAuth() {
    const username = document.getElementById("auth-user").value;
    const password = document.getElementById("auth-pass").value;
    if(!username || !password) return alert("Fill all fields");

    const res = await fetch(isLogin ? "/login" : "/register", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
        myUser = isLogin ? data.user : { username };
        authScreen.style.display = "none";
        socket.emit("join", myUser);
    } else { alert(data.error); }
}

// --- VOICE LOGIC ---
micBtn.onclick = async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.onstart = () => { recordStatus.style.display = "block"; micBtn.style.color = "red"; };
            mediaRecorder.onstop = async () => {
                recordStatus.style.display = "none"; micBtn.style.color = "#8696a0";
                const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                const fd = new FormData(); fd.append("file", audioBlob, "voice.mp3");
                const res = await fetch("/upload", { method: "POST", body: fd });
                const { url } = await res.json();
                sendData(`<audio controls src="${url}"></audio>`, "voice");
            };
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.start();
        } catch(e) { alert("Mic permission denied!"); }
    } else { mediaRecorder.stop(); }
};

// --- CHAT LOGIC ---
const sendData = (msg, type = "text") => {
    const content = type === "text" ? CryptoJS.AES.encrypt(msg, SECRET_KEY).toString() : msg;
    socket.emit("chat message", { from: myUser.username, message: content, type });
};

document.getElementById("form").onsubmit = (e) => {
    e.preventDefault();
    const val = document.getElementById("input").value;
    if (val) { sendData(val); document.getElementById("input").value = ""; }
};

function appendMessage(data) {
    const li = document.createElement("li");
    const isMe = data.from === myUser.username;
    li.className = `message ${isMe ? 'sent' : 'received'}`;
    
    let msgBody = data.message;
    if (data.type === "text") {
        try {
            const bytes = CryptoJS.AES.decrypt(data.message, SECRET_KEY);
            msgBody = bytes.toString(CryptoJS.enc.Utf8);
        } catch(e) { msgBody = "🔒 Encrypted Content"; }
    }

    li.innerHTML = `
        <div class="user-name">${data.from}</div>
        <div class="text">${msgBody}</div>
        <div class="meta">${data.time} ${isMe ? `<span id="tick-${data._id}" style="color:#8696a0">✔✔</span>` : ''}</div>
    `;
    messagesList.appendChild(li);
    messagesList.scrollTop = messagesList.scrollHeight;
    if (!isMe && data._id) socket.emit("message-seen", { msgId: data._id, senderId: data.senderId });
}

socket.on("chat message", appendMessage);
socket.on("chat history", h => h.forEach(appendMessage));
socket.on("update-tick-blue", id => {
    const t = document.getElementById(`tick-${id}`);
    if(t) t.style.color = "#34b7f1";
});

socket.on("user list", users => {
    const ul = document.getElementById("users");
    ul.innerHTML = Object.values(users).map(u => `<li>● ${u.username}</li>`).join("");
});