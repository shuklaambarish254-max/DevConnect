const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  userId: { type: String, required: true },           // User receiving the notification
  fromUserId: { type: String, required: true },       // User performing the action
  type: { type: String, enum: ['follow', 'like', 'comment'], required: true },
  postId: { type: String },                           // For likes and comments
  message: { type: String },                          // Notification text
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', NotificationSchema);
