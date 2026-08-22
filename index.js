const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const app = express();
const port = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/test";

// MongoDB connection
main()
    .then(() => {
        console.log("MongoDB connected");
    })
    .catch((err) => console.log(err));

async function main() {
    await mongoose.connect(MONGODB_URI);
}

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || "threadly_super_secret_key_2026",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
    }
}));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// Post Schema
const postSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    username: String,
    content: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Post = mongoose.model("Post", postSchema);

// Populate currentUser in res.locals for all EJS views
app.use(async (req, res, next) => {
    if (req.session.userId) {
        try {
            const currentUser = await User.findById(req.session.userId);
            res.locals.currentUser = currentUser;
            res.locals.isAdmin = currentUser && currentUser.role === "admin";
        } catch (err) {
            res.locals.currentUser = null;
            res.locals.isAdmin = false;
        }
    } else {
        res.locals.currentUser = null;
        res.locals.isAdmin = false;
    }
    next();
});

// Authentication middleware
function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.redirect("/login");
    }
    next();
}

async function canModifyPost(req, res, next) {
    if (!req.session.userId) {
        return res.redirect("/login");
    }
    try {
        const { id } = req.params;
        const post = await Post.findById(id);
        if (!post) {
            return res.status(404).send("Post not found");
        }
        const currentUser = res.locals.currentUser;
        if (currentUser && (currentUser.role === "admin" || (post.author && post.author.equals(currentUser._id)))) {
            req.post = post;
            return next();
        }
        return res.status(403).send("Unauthorized: You do not have permission to edit or delete this post");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error checking permissions");
    }
}

// Redirect root to /posts
app.get("/", (req, res) => {
    res.redirect("/posts");
});

// --- AUTHENTICATION ROUTES ---

// GET Signup form
app.get("/signup", (req, res) => {
    if (req.session.userId) return res.redirect("/posts");
    res.render("signup.ejs", { error: null });
});

// POST Signup
app.post("/signup", async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        
        if (!username || !email || !password) {
            return res.render("signup.ejs", { error: "All fields are required." });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            return res.render("signup.ejs", { error: "An account with this email already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Assign role: if requested admin, set admin; otherwise user
        const userRole = role === "admin" ? "admin" : "user";

        const newUser = await User.create({
            username: username.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            role: userRole
        });

        req.session.userId = newUser._id;
        console.log(`User registered successfully: ${newUser.email} (${newUser.role})`);
        res.redirect("/posts");
    } catch (err) {
        console.error(err);
        res.render("signup.ejs", { error: "Registration failed. Please try again." });
    }
});

// GET Login form
app.get("/login", (req, res) => {
    if (req.session.userId) return res.redirect("/posts");
    res.render("login.ejs", { error: null });
});

// POST Login
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render("login.ejs", { error: "Email and password are required." });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.render("login.ejs", { error: "Invalid email or password." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render("login.ejs", { error: "Invalid email or password." });
        }

        req.session.userId = user._id;
        console.log(`User logged in: ${user.email} (${user.role})`);
        res.redirect("/posts");
    } catch (err) {
        console.error(err);
        res.render("login.ejs", { error: "Login failed. Please try again." });
    }
});

// POST Logout
app.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error("Logout session destroy error:", err);
        res.redirect("/posts");
    });
});


// --- POST ROUTES ---

// GET all posts
app.get("/posts", async (req, res) => {
    try {
        const posts = await Post.find().populate("author").sort({ createdAt: -1 });
        res.render("index.ejs", { posts });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching posts");
    }
});

// GET new post form (Protected)
app.get("/posts/new", requireLogin, (req, res) => {
    res.render("new.ejs");
});

// CREATE post (Protected)
app.post("/posts", requireLogin, async (req, res) => {
    try {
        const { content } = req.body;
        const currentUser = res.locals.currentUser;

        const newPost = await Post.create({
            author: currentUser._id,
            username: currentUser.username,
            content: content ? content.trim() : ""
        });
        console.log("New post created:", newPost);
        res.redirect("/posts");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating post");
    }
});

// GET single post
app.get("/posts/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const post = await Post.findById(id).populate("author");
        if (!post) {
            return res.status(404).send("Post not found");
        }
        res.render("show.ejs", { post });
    } catch (err) {
        console.error(err);
        res.status(404).send("Post not found");
    }
});

// GET edit post form (Protected & Permission Check)
app.get("/posts/:id/edit", canModifyPost, async (req, res) => {
    try {
        const post = req.post;
        res.render("edit.ejs", { post });
    } catch (err) {
        console.error(err);
        res.status(404).send("Post not found");
    }
});

// UPDATE post (Protected & Permission Check)
app.patch("/posts/:id", canModifyPost, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const updatedPost = await Post.findByIdAndUpdate(
            id,
            { content: content ? content.trim() : "" },
            { new: true, runValidators: true }
        );
        console.log("Post updated:", updatedPost);
        res.redirect(`/posts/${id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating post");
    }
});

// DELETE post (DELETE verb handler) (Protected & Permission Check)
app.delete("/posts/:id", canModifyPost, async (req, res) => {
    try {
        const { id } = req.params;
        await Post.findByIdAndDelete(id);
        console.log(`Post ${id} deleted successfully`);
        res.redirect("/posts");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting post");
    }
});

// DELETE post (POST fallback handler for bulletproof deletion across all forms)
app.post("/posts/:id/delete", canModifyPost, async (req, res) => {
    try {
        const { id } = req.params;
        await Post.findByIdAndDelete(id);
        console.log(`Post ${id} deleted via POST fallback`);
        res.redirect("/posts");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting post");
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});