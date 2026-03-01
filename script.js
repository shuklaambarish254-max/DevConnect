const API = "http://localhost:5000/api";
const API_BASE = API.replace('/api','');

function getToken() {
  return localStorage.getItem("token") || null;
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function addComment(postId, textarea) {
  const text = textarea.value.trim();
  if (!text) return;
  try {
    const res = await fetch(`${API}/posts/${postId}/comment`, { method: 'POST', headers: Object.assign({'Content-Type':'application/json'}, authHeaders()), body: JSON.stringify({ comment: text }) });
    if (!res.ok) throw new Error('Comment failed');
    textarea.value = '';
    loadPosts();
  } catch (e) { console.error(e); alert('Failed to add comment'); }
}

async function likePost(id) {
  try {
    await fetch(`${API}/posts/${id}/like`, {
      method: "POST",
      headers: authHeaders()
    });
    loadPosts();
  } catch (err) {
    console.error(err);
  }
}

// Load posts into #posts. mode: 'all' (default) or 'following'
async function loadPosts(mode = 'all') {
  const postsDiv = document.getElementById('posts');
  if (!postsDiv) return;
  postsDiv.innerHTML = 'Loading...';
  try {
    let url = `${API}/posts`;
    let opts = {};
    if (mode === 'following') { url = `${API}/posts/following`; opts = { headers: authHeaders() }; }
    const res = await fetch(url, opts);
    if (!res.ok) { postsDiv.innerHTML = '<p class="muted">Failed to load posts.</p>'; return; }
    const posts = await res.json();
    if (!Array.isArray(posts) || posts.length === 0) { postsDiv.innerHTML = '<p class="muted">No posts yet.</p>'; return; }
    postsDiv.innerHTML = posts.map(p => {
      const id = p._id || p.id || '';
      const content = escapeHtml(p.content || p.body || '');
      const likes = p.likes || p.likedBy && p.likedBy.length || 0;
      const author = p.user || p.username || p.name || 'User';
      const ownerId = p.userId || p.userID || p.user || '';
      const fileHtml = p.file ? `<div class="post-media"><img src="${API_BASE + p.file}" style="max-width:100%;border-radius:8px"></div>` : '';
      const commentsHtml = (Array.isArray(p.comments) && p.comments.length) ? `<div class="comments">${p.comments.map(c=>`<div class="comment" data-comment-id="${c._id || c.id || ''}
        " data-comment-userid="${c.userId || ''}"><strong>${escapeHtml(c.user||c.userName||c.user)}</strong>: ${escapeHtml(c.text||c.comment||'')} ${String(localStorage.getItem('userId')||'') === String(c.userId||'') ? 
          `<button class="deleteCommentBtn btn" data-post-id="${id}" data-comment-id="${c._id||c.id||''}">Delete</button>` : ''}</div>`).join('')}</div>` : '';
      const ownerControls = String(localStorage.getItem('userId')||'') === String(ownerId) ? `<div class="owner-controls" style="margin-top:8px"><button class="editPostBtn btn" data-id="${id}">Edit</button>
       <button class="deletePostBtn btn" data-id="${id}">Delete</button></div>` : '';
      return `
        <div class="post" data-id="${id}" data-owner-id="${ownerId}">
          <div style="flex:1">
            <div class="post-author muted">${escapeHtml(author)}</div>
            <div class="post-content">${content}</div>
            ${fileHtml}
            <div class="post-meta">
              <button class="likeBtn btn ghost" data-id="${id}">Like (${likes})</button>
              ${ownerControls}
            </div>
            <div class="post-comments">
              ${commentsHtml}
              <div style="margin-top:8px"><textarea placeholder="Add a comment" class="commentInput" data-id="${id}"></textarea><br/><button class="addCommentBtn btn" data-id="${id}">Comment</button></div>
            </div>
          </div>
        </div>`;
    }).join('');

    // wire like/comment buttons
    postsDiv.querySelectorAll('.likeBtn').forEach(b => b.addEventListener('click', (ev)=>{ const id = ev.currentTarget.dataset.id; likePost(id); }));
    postsDiv.querySelectorAll('.addCommentBtn').forEach(b => b.addEventListener('click', (ev)=>{
      const id = ev.currentTarget.dataset.id;
      const ta = postsDiv.querySelector(`textarea.commentInput[data-id="${id}"]`);
      if (ta) addComment(id, ta);
    }));
    // wire edit/delete post and delete comment buttons
    postsDiv.querySelectorAll('.editPostBtn').forEach(b => b.addEventListener('click', async (ev) => {
      const id = ev.currentTarget.dataset.id;
      const newContent = prompt('Edit post content:');
      if (newContent === null) return; // cancelled
      try {
        const res = await fetch(`${API}/posts/${id}`, { method: 'PUT', headers: Object.assign({'Content-Type':'application/json'}, authHeaders()), body: JSON.stringify({ content: newContent }) });
        if (!res.ok) throw new Error('Edit failed');
        loadPosts();
      } catch (e) { console.error(e); alert('Failed to edit post'); }
    }));
    postsDiv.querySelectorAll('.deletePostBtn').forEach(b => b.addEventListener('click', async (ev) => {
      const id = ev.currentTarget.dataset.id;
      if (!confirm('Delete this post?')) return;
      try {
        const res = await fetch(`${API}/posts/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) throw new Error('Delete failed');
        loadPosts();
      } catch (e) { console.error(e); alert('Failed to delete post'); }
    }));
    postsDiv.querySelectorAll('.deleteCommentBtn').forEach(b => b.addEventListener('click', async (ev) => {
      const postId = ev.currentTarget.dataset.postId;
      const commentId = ev.currentTarget.dataset.commentId;
      if (!confirm('Delete this comment?')) return;
      try {
        const res = await fetch(`${API}/posts/${postId}/comment/${commentId}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) throw new Error('Delete comment failed');
        loadPosts();
      } catch (e) { console.error(e); alert('Failed to delete comment'); }
    }));
  } catch (e) {
    console.error(e);
    postsDiv.innerHTML = '<p class="muted">Failed to load posts.</p>';
  }
}

// Create a post using FormData (supports optional file)
async function createPost() {
  const contentEl = document.getElementById('postContent');
  const fileEl = document.getElementById('postFile');
  if (!contentEl) return;
  const content = (contentEl.value || '').trim();
  if (!content && (!fileEl || !fileEl.files || fileEl.files.length === 0)) { alert('Enter content or attach a file'); return; }
  try {
    const fd = new FormData();
    fd.append('content', content);
    if (fileEl && fileEl.files && fileEl.files[0]) fd.append('file', fileEl.files[0]);
    const res = await fetch(`${API}/posts`, { method: 'POST', headers: authHeaders(), body: fd });
    if (!res.ok) { const t = await res.text(); throw new Error(t || 'Create failed'); }
    contentEl.value = '';
    if (fileEl) fileEl.value = null;
    loadPosts();
  } catch (e) { console.error(e); alert('Failed to create post'); }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('name');
  window.location.href = 'login.html';
}

// fetch conversation summaries (unread counts)
async function loadConversationsSummary() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API}/messages/conversations`, { headers: authHeaders() });
    if (!res.ok) return;
    const conv = await res.json();
    const unread = (conv && Array.isArray(conv)) ? conv.reduce((acc, c) => acc + (c.unread||0), 0) : 0;
    const countEl = document.getElementById('msgCount'); if (countEl) countEl.textContent = unread ? `(${unread})` : '';
    // store conv locally for drawer
    window._conversations = conv;
  } catch (e) { console.error(e); }
}

// open messages drawer
function openMessages() {
  // Redirect to chat page (conversation list handled there)
  window.location.href = 'chat.html';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Load and display notifications
async function loadNotifications() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API}/notifications`, { headers: authHeaders() });
    if (!res.ok) return;
    const notifications = await res.json();
    
    // Update unread count
    const unreadCount = notifications.filter(n => !n.read).length;
    const countEl = document.getElementById('notifCount');
    if (countEl) {
      if (unreadCount > 0) {
        countEl.textContent = unreadCount;
        countEl.style.display = 'flex';
      } else {
        countEl.style.display = 'none';
      }
    }
    
    // Display notifications
    const notifList = document.getElementById('notificationsList');
    if (notifList) {
      if (!notifications || notifications.length === 0) {
        notifList.innerHTML = '<p class="muted">No notifications</p>';
        return;
      }
      notifList.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.read ? 'read' : 'unread'}" data-id="${n._id}">
          <div><strong>${n.type === 'follow' ? '👤' : n.type === 'like' ? '❤️' : '💬'} ${escapeHtml(n.message)}</strong></div>
          <div class="muted" style="font-size:0.8rem;margin-top:4px">${new Date(n.createdAt).toLocaleDateString()}</div>
        </div>
      `).join('');
      
      // Add click handler to mark as read
      notifList.querySelectorAll('.notification-item').forEach(el => {
        el.addEventListener('click', async () => {
          const id = el.dataset.id;
          if (!el.classList.contains('read')) {
            try {
              await fetch(`${API}/notifications/${id}/read`, { method: 'PUT', headers: authHeaders() });
              loadNotifications();
            } catch (e) { console.error(e); }
          }
        });
      });
    }
  } catch (err) { console.error('Error loading notifications:', err); }
}

// Toggle notifications panel
function toggleNotifications() {
  const panel = document.getElementById('notificationsPanel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') loadNotifications();
  }
}

// Search users and render results into provided container
async function searchUsers(q, resultsEl) {
  const container = resultsEl || document.getElementById('searchResults');
  if (!container) return;
  const term = (q || '').trim();
  if (!term) { container.innerHTML = '<p class="muted">Type to search users...</p>'; return; }
  container.innerHTML = 'Searching...';
  try {
    const res = await fetch(`${API}/users?search=${encodeURIComponent(term)}`);
    if (!res.ok) { container.innerHTML = '<p class="muted">Search failed</p>'; return; }
    const users = await res.json();
    if (!users || users.length === 0) { container.innerHTML = '<p class="muted">No users found</p>'; return; }
    container.innerHTML = users.map(u => `
      <div class="search-item" data-id="${u.id}" style="display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid rgba(255,255,255,0.03);cursor:pointer">
        <img src="${u.avatar ? (API_BASE + u.avatar) : 'https://via.placeholder.com/40'}" style="width:40px;height:40px;border-radius:50%;object-fit:cover">
        <div>
          <strong>${escapeHtml(u.name)}</strong>
          <div class="muted" style="font-size:0.85rem">${escapeHtml(u.username || '')}</div>
        </div>
      </div>
    `).join('');
    container.querySelectorAll('.search-item').forEach(el => el.addEventListener('click', ()=>{
      const id = el.dataset.id; if (id) window.location.href = `profile.html?u=${encodeURIComponent(id)}`;
    }));
  } catch (e) { console.error(e); container.innerHTML = '<p class="muted">Search failed</p>'; }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Wire up UI actions when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const postBtn = document.getElementById('postBtn'); if (postBtn) postBtn.addEventListener('click', createPost);
  const loginBtn = document.getElementById('loginBtn'); if (loginBtn) loginBtn.addEventListener('click', login);
  const registerBtn = document.getElementById('registerBtn'); if (registerBtn) registerBtn.addEventListener('click', register);
  const logoutBtn = document.getElementById('logoutBtn'); if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // populate profile name
  const usernameEl = document.getElementById('username'); if (usernameEl) usernameEl.textContent = localStorage.getItem('name') || '';

  // messages / notifications wiring
  const messagesBtn = document.getElementById('messagesBtn'); if (messagesBtn) messagesBtn.addEventListener('click', openMessages);
  const notificationBtn = document.getElementById('notificationBtn'); if (notificationBtn) notificationBtn.addEventListener('click', toggleNotifications);
  const clearNotifBtn = document.getElementById('clearNotifBtn'); if (clearNotifBtn) clearNotifBtn.addEventListener('click', async ()=>{ try { await fetch(`${API}/notifications/clear`, 
    { method: 'POST', headers: authHeaders() }); loadNotifications(); } catch(e){ console.error(e); } });

  // initial loads
  loadNotifications();
  loadConversationsSummary();

  // feed controls
  const allBtn = document.getElementById('allFeedBtn');
  const followingBtn = document.getElementById('followingFeedBtn');
  const myPostsBtn = document.getElementById('myPostsBtn');
  if (allBtn && followingBtn) {
    function setActive(btn){ allBtn.classList.remove('active'); followingBtn.classList.remove('active'); if (myPostsBtn) myPostsBtn.classList.remove('active'); btn.classList.add('active'); }
    allBtn.addEventListener('click', ()=>{ setActive(allBtn); loadPosts('all'); });
    followingBtn.addEventListener('click', ()=>{ if (!getToken()) { alert('Log in to see following feed'); return; } setActive(followingBtn); loadPosts('following'); });
    if (myPostsBtn) {
      myPostsBtn.addEventListener('click', async ()=>{
        const uid = localStorage.getItem('userId');
        if (!uid) { alert('Log in to see your posts'); return; }
        setActive(myPostsBtn);
        const postsDiv = document.getElementById("posts");
        postsDiv.innerHTML = 'Loading...';
        try {
          const res = await fetch(`${API}/users/${uid}`);
          if (!res.ok) throw new Error('Fetch failed');
          const data = await res.json();
          const posts = (data && data.posts) || [];
          postsDiv.innerHTML = '';
          if (!Array.isArray(posts) || posts.length === 0) { postsDiv.innerHTML = '<p class="muted">No posts yet.</p>'; return; }
          posts.forEach(p => {
            const el = document.createElement('div'); el.className = 'post';
            const content = p.content || p.body || '';
            const likes = p.likes || 0;
            el.innerHTML = `\n              <p>${escapeHtml(content)}</p>\n              <div class="post-meta">\n           
                 <button data-id="${p.id||p._id||''}" class="likeBtn">Like (${likes})</button>\n              </div>`;
            postsDiv.appendChild(el);
          });
          postsDiv.querySelectorAll('.likeBtn').forEach(b => b.addEventListener('click', () => likePost(b.dataset.id)));
        } catch(e) { postsDiv.innerHTML = '<p class="muted">Failed to load posts.</p>'; }
      });
    }
    setActive(allBtn);
    loadPosts('all');
  }
});

  // when following list changes in another tab, refresh following feed if visible
  window.addEventListener('storage', (e) => {
    if (e.key === 'followingChanged') {
      const followingBtn = document.getElementById('followingFeedBtn');
      if (followingBtn && followingBtn.classList.contains('active')) loadPosts('following');
    }
  });
