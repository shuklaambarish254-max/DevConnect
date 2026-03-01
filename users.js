const router = require('express').Router();
const User = require('../user');
const Post = require('../post');
const Notification = require('../notification');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');

const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    const posts = await Post.find({ userId: String(user._id) }).lean();

    // Get current user for mutual followers calculation
    let currentUser = null;
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, 'secretkey');
        currentUser = await User.findById(decoded.id).lean();
      } catch (e) { /* ignore auth errors */ }
    }

    // Calculate mutual followers (people who follow this user and are followed by current user)
    let mutuals = [];
    if (currentUser && Array.isArray(user.followers) && Array.isArray(currentUser.following)) {
      mutuals = user.followers.filter(f => currentUser.following.includes(f));
    }

    const outUser = {
      id: String(user._id),
      name: user.name || '',
      username: (user.email && user.email.split('@')[0]) || '',
      bio: user.bio || '',
      skills: user.skills || [],
      avatar: user.avatar || null,
      followersCount: (user.followers && user.followers.length) || 0,
      followingCount: (user.following && user.following.length) || 0,
      mutuals: mutuals,
      mutualsCount: mutuals.length
    };

    // enrich posts and comments with author display names (username or name)
    const ids = new Set();
    posts.forEach(p => {
      if (p.userId) ids.add(String(p.userId));
      if (Array.isArray(p.comments)) p.comments.forEach(c => c.userId && ids.add(String(c.userId)));
    });
    let usersMap = {};
    if (ids.size) {
      const users = await User.find({ _id: { $in: Array.from(ids) } }).lean();
      users.forEach(u => { usersMap[String(u._id)] = u; });
    }

    const outPosts = posts.map(p => ({
      id: String(p._id),
      _id: String(p._id),
      content: p.content || '',
      likes: p.likes || 0,
      likedBy: p.likedBy || [],
      comments: (Array.isArray(p.comments) ? p.comments.map(c => ({
        ...c,
        user: (usersMap[String(c.userId)] && (usersMap[String(c.userId)].username || usersMap[String(c.userId)].name)) || c.user || 'User'
      })) : []),
      user: (usersMap[String(p.userId)] && (usersMap[String(p.userId)].username || usersMap[String(p.userId)].name)) || p.user || 'User',
      file: p.file || null,
      createdAt: p.createdAt || null
    }));

    res.json({ user: outUser, posts: outPosts });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// update profile (bio, skills)
router.put('/:id', auth, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (String(req.user.id) !== String(targetId)) return res.status(403).json({ message: 'Forbidden' });
    const update = {};
    if (typeof req.body.name !== 'undefined') update.name = req.body.name;
    if (typeof req.body.bio !== 'undefined') update.bio = req.body.bio;
    if (Array.isArray(req.body.skills)) update.skills = req.body.skills;
    const updated = await User.findByIdAndUpdate(targetId, update, { new: true }).lean();
    res.json({ message: 'Profile updated', user: { id: String(updated._id), name: updated.name || '', bio: updated.bio || '', skills: updated.skills || [],
       avatar: updated.avatar || null } });
  } catch (err) { res.status(500).json({ message: 'Update failed' }); }
});
// search users: /api/users?search=term
router.get('/', async (req, res) => {
  try {
    const q = (req.query.search || req.query.q || '').trim();
    if (!q) return res.json([]);
    // basic case-insensitive search on name or email
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({ $or: [{ name: regex }, { email: regex }] }).limit(20).lean();
    const out = users.map(u => ({ id: String(u._id), name: u.name || '', username: (u.email && u.email.split('@')[0]) || '', avatar: u.avatar || null,
       bio: u.bio || '' }));
    res.json(out);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// upload avatar for authenticated user (or owner)
router.post('/:id/avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    const targetId = req.params.id;
    // only allow owner
    if (String(req.user.id) !== String(targetId)) return res.status(403).json({ message: 'Forbidden' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const rel = '/uploads/' + req.file.filename;
    await User.findByIdAndUpdate(targetId, { avatar: rel });
    res.json({ avatar: rel });
  } catch (err) { res.status(500).json({ message: 'Upload failed' }); }
});

// follow a user
router.post('/:id/follow', auth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    const target = req.params.id;
    if (!me) return res.status(404).json({ message: 'User not found' });
    if (String(me._id) === String(target)) return res.status(400).json({ message: 'Cannot follow yourself' });
    
    me.following = me.following || [];
    if (!me.following.includes(target)) {
      me.following.push(target);
      await me.save();
      
      // Add current user to target's followers list
      const targetUser = await User.findById(target);
      if (targetUser) {
        targetUser.followers = targetUser.followers || [];
        if (!targetUser.followers.includes(req.user.id)) {
          targetUser.followers.push(req.user.id);
          await targetUser.save();
        }
      }
      
      // Create notification for the followed user
      const followerName = (me && me.name) || 'Someone';
      await Notification.create({
        userId: target,
        fromUserId: req.user.id,
        type: 'follow',
        message: `${followerName} started following you`
      });
    }
    res.json({ message: 'Followed' });
  } catch (err) { res.status(500).json({ message: 'Follow failed' }); }
});

// unfollow a user
router.post('/:id/unfollow', auth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    const target = req.params.id;
    if (!me) return res.status(404).json({ message: 'User not found' });
    me.following = me.following || [];
    me.following = me.following.filter(f => String(f) !== String(target));
    await me.save();
    
    // Remove current user from target's followers list
    const targetUser = await User.findById(target);
    if (targetUser) {
      targetUser.followers = targetUser.followers || [];
      targetUser.followers = targetUser.followers.filter(f => String(f) !== String(req.user.id));
      await targetUser.save();
    }
    
    res.json({ message: 'Unfollowed' });
  } catch (err) { res.status(500).json({ message: 'Unfollow failed' }); }
});

module.exports = router;
