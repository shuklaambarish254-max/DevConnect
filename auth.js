const router = require('express').Router();
const User = require('../user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');

router.post('/register', async (req, res) => {
  try {
    // let User model pre-save hook hash the password
    const user = new User({
      name: req.body.name,
      username: req.body.username,
      email: req.body.email,
      password: req.body.password
    });
    await user.save();
    // create token and return user info so frontend can auto-login
    const token = jwt.sign({ id: user._id }, 'secretkey');
    res.json({ token, user: { id: user._id, name: user.name } });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  
  // Normalize input - trim and convert to lowercase for email/username comparison
  const searchTerm = email.trim().toLowerCase();
  
  // Accept both email and username - search by either one (case-insensitive)
  const user = await User.findOne({ 
    $or: [
      { email: { $regex: '^' + searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', $options: 'i' } },
      { username: { $regex: '^' + searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', $options: 'i' } },
      { name: { $regex: '^' + searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', $options: 'i' } }
    ] 
  });
  if (!user) return res.status(400).json({ message: 'User not found' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ message: 'Invalid password' });

  const token = jwt.sign({ id: user._id }, 'secretkey');
  res.json({ token, user: { id: user._id, name: user.name } });
});

// return current authenticated user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: { id: user._id, name: user.name, avatar: user.avatar, following: user.following || [] } });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
