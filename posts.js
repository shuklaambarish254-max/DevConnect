const router = require('express').Router();
const Post = require('../post');
const User = require('../user');
const Notification = require('../notification');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// create post, with optional file upload
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    const postData = { userId: req.user.id, content: req.body.content };
    if (req.file) postData.file = '/uploads/' + req.file.filename;
    const post = new Post(postData);
    await post.save();
    res.json(post);
  } catch (err) { res.status(500).json({ message: 'Create post failed' }); }
});

router.get('/', async (req, res) => {
  try {
    const posts = await Post.find().sort({ _id: -1 }).lean();
    // enrich posts/comments with author display names
    const ids = new Set();
    posts.forEach(p => {
      if (p.userId) ids.add(String(p.userId));
      if (Array.isArray(p.comments)) p.comments.forEach(c => c.userId && ids.add(String(c.userId)));
    });
    if (ids.size) {
      const users = await User.find({ _id: { $in: Array.from(ids) } }).lean();
      const map = {};
      users.forEach(u => { map[String(u._id)] = u; });
      posts.forEach(p => {
        // add author display for the post
        p.user = (map[String(p.userId)] && (map[String(p.userId)].username || map[String(p.userId)].name)) || p.user || 'User';
        if (Array.isArray(p.comments)) {
          p.comments = p.comments.map(c => ({
            ...c,
            user: (map[String(c.userId)] && (map[String(c.userId)].username || map[String(c.userId)].name)) || c.user || 'User'
          }));
        }
      });
    }
    res.json(posts);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// posts from users the current user follows
router.get('/following', auth, async (req, res) => {
  try {
    const User = require('../user');
    const me = await User.findById(req.user.id).lean();
    const following = (me && me.following) || [];
    if (!following.length) return res.json([]);
    const posts = await Post.find({ userId: { $in: following } }).sort({ _id: -1 }).lean();
    // enrich posts/comments with author display names
    const ids = new Set();
    posts.forEach(p => {
      if (p.userId) ids.add(String(p.userId));
      if (Array.isArray(p.comments)) p.comments.forEach(c => c.userId && ids.add(String(c.userId)));
    });
    if (ids.size) {
      const users = await User.find({ _id: { $in: Array.from(ids) } }).lean();
      const map = {};
      users.forEach(u => { map[String(u._id)] = u; });
      posts.forEach(p => {
        // add author display for the post
        p.user = (map[String(p.userId)] && (map[String(p.userId)].username || map[String(p.userId)].name)) || p.user || 'User';
        if (Array.isArray(p.comments)) {
          p.comments = p.comments.map(c => ({
            ...c,
            user: (map[String(c.userId)] && (map[String(c.userId)].username || map[String(c.userId)].name)) || c.user || 'User'
          }));
        }
      });
    }
    res.json(posts);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// like a post (requires auth) - only one like per user
router.post('/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const uid = String(req.user.id);
    post.likedBy = post.likedBy || [];
    if (post.likedBy.map(String).includes(uid)) {
      return res.status(400).json({ message: 'Already liked' });
    }
    post.likedBy.push(uid);
    post.likes = post.likedBy.length;
    await post.save();
    
    // Create notification for post owner
    if (String(post.userId) !== uid) {
      const user = await User.findById(uid).lean();
      const userName = (user && user.name) || 'Someone';
      await Notification.create({
        userId: post.userId,
        fromUserId: uid,
        type: 'like',
        postId: post._id,
        message: `${userName} liked your post`
      });
    }
    
    res.json(post);
  } catch (err) { res.status(500).json({ message: 'Like failed' }); }
});

// add a comment (requires auth)
router.post('/:id/comment', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const text = (req.body.comment || '').toString().trim();
    if (!text) return res.status(400).json({ message: 'Empty comment' });
    post.comments = post.comments || [];
    post.comments.push({ userId: req.user.id, text });
    await post.save();
    
    // Create notification for post owner
    if (String(post.userId) !== String(req.user.id)) {
      const user = await User.findById(req.user.id).lean();
      const userName = (user && user.name) || 'Someone';
      await Notification.create({
        userId: post.userId,
        fromUserId: req.user.id,
        type: 'comment',
        postId: post._id,
        message: `${userName} commented on your post`
      });
    }
    
    res.json(post);
  } catch (err) { res.status(500).json({ message: 'Comment failed' }); }
});

// edit a post (owner only) - can update text content and optionally replace file
router.put('/:id', auth, upload.single('file'), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (String(post.userId) !== String(req.user.id)) return res.status(403).json({ message: 'Not authorized' });
    if (typeof req.body.content === 'string') post.content = req.body.content;
    if (req.file) post.file = '/uploads/' + req.file.filename;
    await post.save();
    res.json(post);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Edit failed' }); }
});

// delete a post (owner only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (String(post.userId) !== String(req.user.id)) return res.status(403).json({ message: 'Not authorized' });
    await Post.deleteOne({ _id: post._id });
    res.json({ message: 'Post deleted' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Delete failed' }); }
});

// delete a comment (comment owner only)
router.delete('/:id/comment/:commentId', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (String(comment.userId) !== String(req.user.id)) return res.status(403).json({ message: 'Not authorized' });
    // remove comment by filtering (avoid calling subdocument remove())
    post.comments = (post.comments || []).filter(c => String(c._id || c.id) !== String(req.params.commentId));
    await post.save();
    res.json(post);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Delete comment failed' }); }
});

module.exports = router;
