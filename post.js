const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  userId: String,
  text: String,
  createdAt: { type: Date, default: Date.now }
});

const PostSchema = new mongoose.Schema({
  userId: String,
  content: String,
  file: String,
  likes: { type: Number, default: 0 },
  likedBy: { type: [String], default: [] },
  comments: [CommentSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Post', PostSchema);
