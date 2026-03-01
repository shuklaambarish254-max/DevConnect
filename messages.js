const router = require('express').Router();
const auth = require('../middleware/auth');
const Message = require('../message');

// send a message to another user
router.post('/', auth, async (req, res) => {
  try {
    const from = String(req.user.id);
    const to = String(req.body.to || '');
    const text = (req.body.text || '').toString().trim();
    if (!to || !text) return res.status(400).json({ message: 'Missing to/text' });
    console.log('[messages] send from=%s to=%s text=%s', from, to, text);
    const msg = new Message({ from, to, text });
    await msg.save();
    console.log('[messages] saved id=%s', msg._id);
    res.json(msg);
  } catch (err) { res.status(500).json({ message: 'Send failed' }); }
});

// list conversations (brief) for current user
router.get('/conversations', auth, async (req, res) => {
  try {
    const uid = String(req.user.id);
    // aggregate latest message per conversation (other user)
    const agg = await Message.aggregate([
      { $match: { $or: [{ from: uid }, { to: uid }] } },
      { $project: { other: { $cond: [{ $eq: ["$from", uid] }, "$to", "$from"] }, text: 1, from:1, to:1, read:1, createdAt:1 } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$other", last: { $first: "$text" }, lastAt: { $first: "$createdAt" }, lastFrom: { $first: "$from" }, unread: 
      { $sum: { $cond: [ { $and: [ { $eq: ["$to", uid] }, { $eq: ["$read", false] } ] }, 1, 0 ] } } } },
      { $sort: { lastAt: -1 } }
    ]).exec();
    res.json(agg.map(a => ({ userId: a._id, last: a.last, lastAt: a.lastAt, lastFrom: a.lastFrom, unread: a.unread || 0 }))); 
  } catch (err) { res.status(500).json({ message: 'Failed' }); }
});

// get conversation with a user (and mark as read)
router.get('/:userId', auth, async (req, res) => {
  try {
    const me = String(req.user.id);
    const other = String(req.params.userId);
    const msgs = await Message.find({ $or: [ { from: me, to: other }, { from: other, to: me } ] }).sort({ createdAt: 1 }).lean();
    // mark messages to me from other as read
    const upd = await Message.updateMany({ from: other, to: me, read: false }, { $set: { read: true } });
    console.log('[messages] conversation between %s and %s; returned %d messages; markedRead=%d', me, other, msgs.length, 
      upd.nModified || upd.modifiedCount || 0);
    res.json(msgs);
  } catch (err) { res.status(500).json({ message: 'Failed' }); }
});

module.exports = router;
