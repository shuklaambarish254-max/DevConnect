const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./models/routes/auth');
const postRoutes = require('./models/routes/posts');
const usersRoutes = require('./models/routes/users');
const messagesRoutes = require('./models/routes/messages');
const notificationsRoutes = require('./models/routes/notifications');

const app = express();
app.use(cors());
app.use(express.json());

// serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

mongoose.connect('mongodb://127.0.0.1:27017/devconnect', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

mongoose.connection.on('error', err => console.error('MongoDB error:', err));

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/notifications', notificationsRoutes);

app.listen(5000, () => {
  console.log('Server running on port 5000');
});
