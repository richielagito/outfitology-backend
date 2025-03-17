const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema(
  {
    outfitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Outfit",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Comment", CommentSchema);
