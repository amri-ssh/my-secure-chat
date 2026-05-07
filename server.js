const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcryptjs");

const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/chatapp";

mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log("MongoDB Connected Successfully! ✅"))
  .catch(err => console.error("DB Connection Error: ❌", err.message));

// Updated Schemas
const User = mongoose.model("User", new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: "https://cdn-icons-png.flaticon.com/512/149/149071.png" }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
    from: String,
    to: { type: String, default: "Global" },
    message: String,
    time: String,
    type: { type: String, default: "text" }
}));

app.use(express.static("public", {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
}));
app.use(express.json());

const storage = multer.diskStorage({
    destination: "./public/uploads/",
    filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// Auth Routes
app.post("/register", async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ success: false, error: "User already exists" });
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        res.json({ success: true, user: { username: user.username, profilePic: user.profilePic } });
    } else { res.status(400).json({ error: "Invalid credentials" }); }
});

app.post("/upload", upload.single("file"), (req, res) => {
    if (req.file) res.json({ url: `/uploads/${req.file.filename}` });
});

// Socket Logic for Private & Global Chat
let onlineUsers = {}; 

io.on("connection", (socket) => {
    socket.on("join", async (user) => {
        socket.username = user.username;
        onlineUsers[user.username] = socket.id;
        io.emit("user list", Object.keys(onlineUsers));
        
        const history = await Message.find({ to: "Global" }).sort({_id: -1}).limit(50);
        socket.emit("chat history", history.reverse());
    });

    socket.on("chat message", async (data) => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const savedMsg = await Message.create({ ...data, time });

        if (data.to === "Global") {
            io.emit("chat message", savedMsg);
        } else {
            const targetSocket = onlineUsers[data.to];
            if (targetSocket) io.to(targetSocket).emit("chat message", savedMsg);
            socket.emit("chat message", savedMsg); 
        }
    });

    socket.on("disconnect", () => {
        delete onlineUsers[socket.username];
        io.emit("user list", Object.keys(onlineUsers));
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));