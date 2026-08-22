const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");

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

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

// Schema
const postSchema = new mongoose.Schema({
    username: String,
    content: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Model
const Post = mongoose.model("Post", postSchema);

// Redirect root to /posts
app.get("/", (req, res) => {
    res.redirect("/posts");
});

// GET all posts
app.get("/posts", async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 });
        res.render("index.ejs", { posts });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching posts");
    }
});

// GET new post form
app.get("/posts/new", (req, res) => {
    res.render("new.ejs");
});

// CREATE post
app.post("/posts", async (req, res) => {
    try {
        const { username, content } = req.body;
        const newPost = await Post.create({
            username: username ? username.trim() : "anonymous",
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
        const post = await Post.findById(id);
        if (!post) {
            return res.status(404).send("Post not found");
        }
        res.render("show.ejs", { post });
    } catch (err) {
        console.error(err);
        res.status(404).send("Post not found");
    }
});

// GET edit post form
app.get("/posts/:id/edit", async (req, res) => {
    try {
        const { id } = req.params;
        const post = await Post.findById(id);
        if (!post) {
            return res.status(404).send("Post not found");
        }
        res.render("edit.ejs", { post });
    } catch (err) {
        console.error(err);
        res.status(404).send("Post not found");
    }
});

// UPDATE post (PATCH)
app.patch("/posts/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { username, content } = req.body;
        const updatedPost = await Post.findByIdAndUpdate(
            id,
            { username: username ? username.trim() : "anonymous", content: content ? content.trim() : "" },
            { new: true, runValidators: true }
        );
        console.log("Post updated:", updatedPost);
        res.redirect(`/posts/${id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating post");
    }
});

// DELETE post (DELETE verb handler)
app.delete("/posts/:id", async (req, res) => {
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
app.post("/posts/:id/delete", async (req, res) => {
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
