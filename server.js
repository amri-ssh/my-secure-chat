const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcryptjs");

// Online-la environment variable edukkum, illana local-ah connect pannum
const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/chatapp";

mongoose.connect(mongoURI)
  .then(() => console.log("MongoDB Connected Successfully! ✅"))
  .catch(err => console.error("MongoDB Connection Error: ❌", err));

const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true },
  password: { type: String }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  from: String, to: String, message: String, time: String, senderId: String, type: String
}));

app.use(express.static("public"));
app.use(express.json());

// File Upload Logic
const storage = multer.diskStorage({
  destination: "./public/uploads/",
  filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

app.post("/register", async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword });
        res.json({ success: true });
    } catch (e) { res.status(400).json({ error: "User already exists" }); }
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        res.json({ success: true, user });
    } else { res.status(400).json({ error: "Invalid Credentials" }); }
});

app.post("/upload", upload.single("file"), (req, res) => {
    if (req.file) res.json({ url: `/uploads/${req.file.filename}` });
});

// Socket.io Real-time Logic
let users = {};
io.on("connection", (socket) => {
    socket.on("join", async (userData) => {
        users[socket.id] = { ...userData, status: "Online" };
        io.emit("user list", users);
        const history = await Message.find().sort({_id: -1}).limit(50);
        socket.emit("chat history", history.reverse());
    });

    socket.on("chat message", async (data) => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const savedMsg = await Message.create({ ...data, time, senderId: socket.id });
        io.emit("chat message", { ...data, _id: savedMsg._id, time, senderId: socket.id });
    });

    socket.on("message-seen", (d) => io.to(d.senderId).emit("update-tick-blue", d.msgId));

    socket.on("disconnect", () => {
        delete users[socket.id];
        io.emit("user list", users);
    });
});

// Port setting for Render
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));