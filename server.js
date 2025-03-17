require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const fetch = require("node-fetch");
const saltRounds = 10;
const User = require("./models/User");
const Outfit = require("./models/Outfit");
const Comment = require("./models/Comment");

const app = express();
const PORT = process.env.PORT;

const dbURL = process.env.MONGODB_URL;

// Middleware CORS
app.use(
    cors({
        origin: (origin, callback) => {
            const allowedOrigins = ["http://127.0.0.1:5500"];
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
    })
);

// Middleware untuk parsing body request
app.use(bodyParser.json());
app.use(express.json());

// Koneksi ke MongoDB
mongoose
    .connect(dbURL)
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.error("Error connecting to MongoDB:", err));

// Unsplash API
app.get("/api/unsplash", async (req, res) => {
    try {
        const query = req.query.query || "fashion, streetwear, outfit, casual outfit";
        const response = await fetch(`https://api.unsplash.com/photos/random?count=30&query=${query}&client_id=${process.env.UNSPLASH_ACCESS_KEY}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Error fetching images from Unsplash:", error);
        res.status(500).json({ message: "Failed to fetch images from Unsplash" });
    }
});

// Route untuk registrasi user
app.post("/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        console.log("Request Data:", { username, email, password: hashedPassword });

        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: "User registered successfully!" });
    } catch (err) {
        console.error("Error in /register route:", err);
        res.status(500).json({ message: "Error registering user", error: err.message });
    }
});

// Login
app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).send({ message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            res.status(200).send({
                message: "Login successful",
                user: {
                    _id: user._id,
                    username: user.username,
                    email: user.email,
                },
            });
        } else {
            res.status(401).send({ message: "Invalid credentials" });
        }
    } catch (error) {
        res.status(500).send({ message: "Server error", error });
    }
});

// add comment
app.post("/comments", async (req, res) => {
    try {
        const { outfitId, userId, text } = req.body;

        // Validasi input
        if (!outfitId || !userId || !text) {
            return res.status(400).json({
                message: "Missing required fields",
                received: { outfitId, userId, text },
            });
        }

        const newComment = new Comment({
            outfitId,
            userId,
            text,
        });

        await newComment.save();

        // Populate user info sebelum mengirim response
        const populatedComment = await Comment.findById(newComment._id).populate("userId", "username");

        // Update outfit dengan referensi comment baru
        await Outfit.findByIdAndUpdate(outfitId, { $push: { comments: newComment._id } });

        res.status(201).json({
            message: "Comment added successfully",
            comment: populatedComment,
        });
    } catch (err) {
        console.error("Error in POST /comments:", err);
        res.status(500).json({ message: "Error creating comment", error: err.message });
    }
});

// Get comments
app.get("/comments/:outfitId", async (req, res) => {
    try {
        if (!req.params.outfitId || req.params.outfitId === "undefined") {
            return res.status(400).json({ message: "Invalid outfit ID" });
        }

        const comments = await Comment.find({ outfitId: req.params.outfitId }).populate("userId", "username").sort({ createdAt: -1 });

        res.json(comments);
    } catch (err) {
        console.error("Error in GET /comments/:outfitId:", err);
        res.status(500).json({ message: "Error fetching comments", error: err.message });
    }
});

// Update comment
app.put("/comments/:commentId", async (req, res) => {
    try {
        const { text } = req.body;
        const updatedComment = await Comment.findByIdAndUpdate(req.params.commentId, { text }, { new: true }).populate("userId", "username");

        if (!updatedComment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        res.json({
            message: "Comment updated successfully",
            comment: updatedComment,
        });
    } catch (err) {
        res.status(500).json({ message: "Error updating comment", error: err.message });
    }
});

// Delete comment
app.delete("/comments/:commentId", async (req, res) => {
    try {
        const comment = await Comment.findByIdAndDelete(req.params.commentId);
        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }
        res.json({ message: "Comment deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Error deleting comment", error: err.message });
    }
});

app.put("/user/:userId", async (req, res) => {
    try {
        const { username } = req.body;

        const existingUser = await User.findOne({
            username: username,
            _id: { $ne: req.params.userId },
        });

        if (existingUser) {
            return res.status(400).json({ message: "Username already taken" });
        }

        const updatedUser = await User.findByIdAndUpdate(req.params.userId, { username: username }, { new: true });

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            message: "Username updated successfully",
            user: {
                _id: updatedUser._id,
                username: updatedUser.username,
                email: updatedUser.email,
            },
        });
    } catch (err) {
        res.status(500).json({ message: "Error updating username", error: err.message });
    }
});

app.delete("/user/:id", async (req, res) => {
    try {
        await Outfit.deleteMany({ user: req.params.id });

        const user = await User.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ message: "User deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// Get user data
app.get("/user/:username", async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json({
            _id: user._id,
            username: user.username,
            email: user.email,
        });
    } catch (err) {
        res.status(500).json({ message: "Error fetching user data", error: err.message });
    }
});

// Get outfits
app.get("/outfits/user/:userId", async (req, res) => {
    try {
        const outfits = await Outfit.find({ user: req.params.userId }).sort({
            createdAt: -1,
        });
        res.json(outfits);
    } catch (err) {
        res.status(500).json({ message: "Error fetching outfits", error: err.message });
    }
});

// Create outfit
app.post("/outfits", async (req, res) => {
    try {
        const { name, description, image, userId } = req.body;

        if (!name || !description || !image || !userId) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const newOutfit = new Outfit({
            name,
            description,
            image,
            user: userId,
        });

        await newOutfit.save();
        res.status(201).json({ message: "Outfit created successfully!", outfit: newOutfit });
    } catch (err) {
        res.status(500).json({ message: "Error creating outfit", error: err.message });
    }
});

// Get all outfits
app.get("/outfits", async (req, res) => {
    try {
        const outfits = await Outfit.find().populate("user", "username").populate("likes").sort({ createdAt: -1 });
        res.json(outfits);
    } catch (err) {
        res.status(500).json({ message: "Error fetching outfits", error: err.message });
    }
});

app.post("/outfits/:outfitId/like", async (req, res) => {
    try {
        const { userId } = req.body;
        const { outfitId } = req.params;

        if (!userId || !outfitId) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const outfit = await Outfit.findById(outfitId);
        if (!outfit) {
            return res.status(404).json({ message: "Outfit not found" });
        }

        const userLikedIndex = outfit.likes.indexOf(userId);
        let liked;

        if (userLikedIndex === -1) {
            // User hasn't liked the outfit yet, so add the like
            outfit.likes.push(userId);
            liked = true;
        } else {
            // User already liked the outfit, so remove the like
            outfit.likes.splice(userLikedIndex, 1);
            liked = false;
        }

        await outfit.save();

        res.json({
            message: liked ? "Like added successfully" : "Like removed successfully",
            liked: liked,
            likeCount: outfit.likes.length,
        });
    } catch (err) {
        res.status(500).json({ message: "Error toggling like", error: err.message });
    }
});

app.get("/outfits/:outfitId/likes", async (req, res) => {
    try {
        const { outfitId } = req.params;
        const { userId } = req.query;

        const outfit = await Outfit.findById(outfitId);
        if (!outfit) {
            return res.status(404).json({ message: "Outfit not found" });
        }

        res.json({
            likeCount: outfit.likes.length,
            liked: userId ? outfit.likes.includes(userId) : false,
        });
    } catch (err) {
        res.status(500).json({ message: "Error fetching likes", error: err.message });
    }
});

// Edit outfit
app.put("/outfits/:id", async (req, res) => {
    try {
        const { name, description, image } = req.body;

        if (!name || !description || !image) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const updatedOutfit = await Outfit.findByIdAndUpdate(req.params.id, { name, description, image }, { new: true });

        if (!updatedOutfit) {
            return res.status(404).json({ message: "Outfit not found" });
        }

        res.json({ message: "Outfit updated successfully", outfit: updatedOutfit });
    } catch (err) {
        res.status(500).json({ message: "Error updating outfit", error: err.message });
    }
});

// Delete multiple outfits
app.delete("/outfits", async (req, res) => {
    try {
        const { outfitIds } = req.body;

        if (!outfitIds || !Array.isArray(outfitIds) || outfitIds.length === 0) {
            return res.status(400).json({ message: "Invalid outfit IDs provided" });
        }

        const result = await Outfit.deleteMany({ _id: { $in: outfitIds } });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "No outfits found to delete" });
        }

        res.json({
            message: "Successfully deleted ${result.deletedCount} outfits",
            deletedCount: result.deletedCount,
        });
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ message: "Error deleting outfits", error: err.message });
    }
});

// Jalankan server

const fetch = require("node-fetch"); // Pastikan sudah install: npm install node-fetch

app.get("/api/unsplash", async (req, res) => {
    try {
        const query = req.query.query || "fashion, streetwear, outfit, casual outfit";
        const response = await fetch(`https://api.unsplash.com/photos/random?count=30&query=${query}&client_id=${process.env.UNSPLASH_ACCESS_KEY}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Error fetching images from Unsplash:", error);
        res.status(500).json({ message: "Failed to fetch images from Unsplash" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
