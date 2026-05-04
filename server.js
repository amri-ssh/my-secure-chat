const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcryptjs");

// Online-la MongoDB Atlas URL use pannanum (Later step), ippo local-ahve vekkalam
const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/chatapp";
mongoose.connect(mongoURI);

const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true },
  password: { type: String }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  from: String, to: String, message: String, time: String, senderId: String, type: String, group: String
}));

app.use(express.static("public"));
app.use(express.json());

const storage = multer.diskStorage({
  destination: "./public/uploads/",
  filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

app.post("/register", async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        await User.create({ username: req.body.username, password: hashedPassword });
        res.json({ success: true });
    } catch (e) { res.status(400).json({ error: "User already exists" }); }
});

app.post("/login", async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        res.json({ success: true, user });
    } else { res.status(400).json({ error: "Invalid login!" }); }
});

app.post("/upload", upload.single("file"), (req, res) => {
    res.json({ url: `/uploads/${req.file.filename}` });
});

let users = {};
let groups = [];

io.on("connection", (socket) => {
    socket.on("join", async (userData) => {
        users[socket.id] = { ...userData, status: "Online" };
        io.emit("user list", users);
        io.emit("group list", groups);
        const history = await Message.find({ to: null }).sort({_id: -1}).limit(50);
        socket.emit("chat history", history.reverse());
    });

    // Group Creation Logic
    socket.on("create-group", (groupName) => {
        if(!groups.includes(groupName)) {
            groups.push(groupName);
            io.emit("group list", groups);
        }
    });

    socket.on("join-group", (groupName) => {
        socket.join(groupName);
    });

    socket.on("chat message", async (data) => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const saved = await Message.create({ ...data, time, senderId: socket.id });
        
        if(data.toGroup) {
            io.to(data.toGroup).emit("chat message", { ...data, _id: saved._id, time, senderId: socket.id });
        } else {
            io.emit("chat message", { ...data, _id: saved._id, time, senderId: socket.id });
        }
    });

    socket.on("message-seen", (d) => io.to(d.senderId).emit("update-tick-blue", d.msgId));

    socket.on("disconnect", () => {
        delete users[socket.id];
        io.emit("user list", users);
    });
});

// IMPORTANT FOR DEPLOYMENT: process.env.PORT use pannanum
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));