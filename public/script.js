const socket = io();
const SECRET_KEY = "chat-master-key-123";
let isLogin = true, myUser = null, mediaRecorder, audioChunks = [];

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
        document.getElementById("auth-screen").style.display = "none";
        socket.emit("join", myUser);
    } else { alert(data.error); }
}

const micBtn = document.getElementById("mic-btn");
micBtn.onclick = async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.onstart = () => { document.getElementById("record-status").style.display = "block"; };
            mediaRecorder.onstop = async () => {
                document.getElementById("record-status").style.display = "none";
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
    const isMe = data.from === (myUser ? myUser.username : '');
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
    document.getElementById("users").innerHTML = Object.values(users).map(u => `<li>● ${u.username}</li>`).join("");
});