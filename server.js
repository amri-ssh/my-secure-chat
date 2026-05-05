const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcryptjs");

// Render-la irukura MONGODB_URI-ah edukkum, illana local-ah connect pannum
const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/chatapp";

// Database Connection with Timeout handling
mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 5000 // 5 seconds-kulla connect aagala-na error kaattum
})
.then(() => console.log("MongoDB Connected Successfully! ✅"))
.catch(err => {
    console.error("DB Connection Error: ❌", err.message);
    // Server-ah thirumba restart panna try pannum
});

// Database Schemas
const User = mongoose.model("User", new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
    from: String,
    to: String,
    message: String,
    time: String,
    senderId: String,
    type: String
}));

app.use(express.static("public"));
app.use(express.json());

// File Upload Logic (Voice/Images)
const storage = multer.diskStorage({
    destination: "./public/uploads/",
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// API: User Registration
app.post("/register", async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, error: "User already exists" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: "Server error during registration" });
    }
});

// API: User Login
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (user && await bcrypt.compare(password, user.password)) {
            res.json({ success: true, user: { username: user.username } });
        } else {
            res.status(400).json({ success: false, error: "Invalid username or password" });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: "Server error during login" });
    }
});

// API: File Upload
app.post("/upload", upload.single("file"), (req, res) => {
    if (req.file) {
        res.json({ url: `/uploads/${req.file.filename}` });
    } else {
        res.status(400).json({ error: "Upload failed" });
    }
});

// Socket.io: Real-time Communication
let onlineUsers = {};
io.on("connection", (socket) => {
    socket.on("join", async (userData) => {
        onlineUsers[socket.id] = { ...userData, status: "Online" };
        io.emit("user list", onlineUsers);
        
        // Chat history-ah eduthu anupum (limit 50 messages)
        const history = await Message.find().sort({_id: -1}).limit(50);
        socket.emit("chat history", history.reverse());
    });

    socket.on("chat message", async (data) => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const savedMsg = await Message.create({ ...data, time, senderId: socket.id });
        io.emit("chat message", { ...data, _id: savedMsg._id, time, senderId: socket.id });
    });

    socket.on("message-seen", (data) => {
        io.to(data.senderId).emit("update-tick-blue", data.msgId);
    });

    socket.on("disconnect", () => {
        delete onlineUsers[socket.id];
        io.emit("user list", onlineUsers);
    });
});

// Port configuration for Render (10000 is default)
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} 🚀`);
});