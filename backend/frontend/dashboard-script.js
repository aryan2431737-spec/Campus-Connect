let socket;

const API_URL = '/api';
const state = {
    dashboard: null,
    dashboardPromise: null,
    currentChatId: null,
    currentReceiverId: null,
    currentChat: null,
    refreshTimer: null
};

document.addEventListener('DOMContentLoaded', () => {
    bootstrapDashboard().catch((error) => {
        console.error('Dashboard bootstrap error:', error);
        showDashboardNotification(error.message || 'Could not load dashboard', 'error');
    });
});

async function bootstrapDashboard() {
    checkAuth();
    bindGlobalEvents();
    updateProfileDisplay(getCurrentUser());
    initializeSocket();
    startAutoRefresh();
    navigateTo('home', false);
    await refreshCurrentUser();
    const data = await fetchDashboardState(true);
    await loadPageData('home', data);
    if (typeof feather !== 'undefined') feather.replace();
    await maybeOpenPendingChat();
}

function bindGlobalEvents() {
    document.querySelectorAll('.nav-item[data-page]').forEach((item) => {
        item.addEventListener('click', (event) => {
            event.preventDefault();
            navigateTo(item.getAttribute('data-page'));
        });
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.notification-btn') && !event.target.closest('.notification-dropdown')) {
            document.getElementById('notificationDropdown')?.classList.remove('active');
        }

        if (!event.target.closest('.user-menu') && !event.target.closest('.user-dropdown')) {
            document.getElementById('userDropdown')?.classList.remove('active');
        }

        if (event.target.classList.contains('modal-overlay')) {
            const modal = event.target.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        }
    });

    document.getElementById('reportForm')?.addEventListener('submit', handleReportSubmit);

    document.getElementById('globalSearch')?.addEventListener('input', (event) => {
        const query = event.target.value.trim().toLowerCase();
        if (query) {
            filterAllItems(query).catch((error) => console.error('Global search error:', error));
        }
    });

    document.getElementById('messageInput')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    document.getElementById('reportImageUpload')?.addEventListener('change', (event) => {
        const label = document.getElementById('reportImageLabel');
        const fileName = event.target.files?.[0]?.name;
        if (label) {
            label.textContent = fileName || 'Click to upload a clear photo';
        }
    });

    document.getElementById('profilePhotoInput')?.addEventListener('change', handleProfilePhotoChange);

    window.addEventListener('focus', () => {
        refreshDashboardData({ announceMatches: false }).catch((error) => console.error('Window refresh error:', error));
    });
}

function checkAuth() {
    if (!localStorage.getItem('token')) {
        window.location.href = 'auth.html';
    }
}

function authHeader() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function clearAuthState() {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userData');
    localStorage.removeItem('token');
    clearPendingChat();
}

async function apiCall(endpoint, options = {}) {
    const headers = { ...authHeader(), ...(options.headers || {}) };
    const isFormData = options.body instanceof FormData;

    if (!isFormData && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    });

    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
        clearAuthState();
        window.location.href = 'auth.html';
        throw new Error(data.message || 'Your session has expired. Please sign in again.');
    }

    if (!response.ok) {
        throw new Error(data.message || 'API error');
    }

    return data;
}

function getCurrentUser() {
    return JSON.parse(localStorage.getItem('userData') || '{}');
}

function setCurrentUser(user) {
    localStorage.setItem('userData', JSON.stringify(user || {}));
    updateProfileDisplay(user || {});
}

async function refreshCurrentUser() {
    try {
        const user = await apiCall('/profile');
        setCurrentUser(user);
        return user;
    } catch (error) {
        console.error('Profile refresh error:', error);
        return getCurrentUser();
    }
}

function initializeSocket() {
    if (typeof io === 'undefined') {
        console.warn('Realtime socket client is unavailable in this deployment target.');
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    if (socket) {
        socket.disconnect();
    }

    socket = io({
        auth: { token }
    });

    socket.on('receive_message', async (chat) => {
        if (state.currentChatId === chat.matchId) {
            renderActiveChat(chat);
        }
        await refreshDashboardData({ announceMatches: false });
    });

    socket.on('new_chat_notification', async (payload) => {
        showDashboardNotification(`New message from ${payload.from}`, 'info');
        await refreshDashboardData({ announceMatches: false });
    });

    socket.on('item_match', async (payload) => {
        showDashboardNotification(
            payload?.message || `New match: ${payload.myItem?.title} and ${payload.matchedItem?.title}`,
            'success'
        );
        await refreshDashboardData({ announceMatches: false });
    });

    socket.on('chat_error', (payload) => {
        showDashboardNotification(payload?.message || 'Chat error', 'error');
    });
}

function startAutoRefresh() {
    if (state.refreshTimer) {
        clearInterval(state.refreshTimer);
    }

    state.refreshTimer = setInterval(() => {
        if (document.hidden) return;
        refreshDashboardData({ announceMatches: true }).catch((error) => {
            console.error('Auto refresh error:', error);
        });
    }, 25000);
}

function invalidateDashboardState() {
    state.dashboard = null;
}

async function fetchDashboardState(force = false) {
    if (!force && state.dashboard) {
        return state.dashboard;
    }

    if (!force && state.dashboardPromise) {
        return state.dashboardPromise;
    }

    state.dashboardPromise = apiCall('/dashboard')
        .then((data) => {
            state.dashboard = data;
            updateSidebarCounts(data);
            updateDashboardStats(data);
            updateHeroMetrics(data);
            renderNotifications(data);
            return data;
        })
        .finally(() => {
            state.dashboardPromise = null;
        });

    return state.dashboardPromise;
}

async function refreshDashboardData(options = {}) {
    const { announceMatches = true } = options;
    const previous = state.dashboard;
    const data = await fetchDashboardState(true);

    if (announceMatches) {
        showNewMatchNotifications(previous, data);
    }

    await rerenderActivePage(data);
    return data;
}

function manualRefreshDashboard() {
    refreshDashboardData({ announceMatches: false })
        .then(() => showDashboardNotification('Dashboard refreshed', 'success'))
        .catch((error) => showDashboardNotification(error.message || 'Refresh failed', 'error'));
}

function showNewMatchNotifications(previousData, nextData) {
    const previousKeys = new Set((previousData?.matchSummary || []).map((match) => buildMatchKey(match)));

    (nextData?.matchSummary || [])
        .filter((match) => !previousKeys.has(buildMatchKey(match)))
        .slice(0, 2)
        .forEach((match) => {
            showDashboardNotification(`Potential match found for ${match.myItem?.title}`, 'success');
        });
}

function buildMatchKey(match) {
    return `${match?.myItem?._id || ''}:${match?.matchedItem?._id || ''}`;
}

async function rerenderActivePage(data) {
    const activePage = document.querySelector('.page.active')?.id?.replace('-page', '') || 'home';
    await loadPageData(activePage, data);

    if (activePage === 'messages' && state.currentChatId) {
        await openChatById(state.currentChatId, state.currentReceiverId, { skipNavigate: true, fromRefresh: true });
    }
}

function navigateTo(page, shouldLoad = true) {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.page').forEach((pageNode) => pageNode.classList.remove('active'));

    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
    document.getElementById(`${page}-page`)?.classList.add('active');

    if (window.innerWidth <= 960) {
        document.getElementById('sidebar')?.classList.remove('active');
    }

    if (shouldLoad) {
        loadPageData(page).catch((error) => {
            console.error(`Load page error for ${page}:`, error);
            showDashboardNotification(error.message || 'Could not load page', 'error');
        });
    }
}

async function loadPageData(page, data = null) {
    switch (page) {
        case 'home':
            return loadHomePage(data);
        case 'lost-items':
            return loadLostItems(data);
        case 'found-items':
            return loadFoundItems(data);
        case 'my-reports':
            return loadMyReports();
        case 'messages':
            return loadMessages(data);
        case 'profile':
            return updateProfileDisplay(getCurrentUser());
        default:
            return undefined;
    }
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getDisplayName(user) {
    if (!user) return 'Unknown User';
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return fullName || user.name || 'Unknown User';
}

function getUserInitials(user) {
    const name = getDisplayName(user);
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || 'U';
}

function renderAvatarMarkup(user) {
    const avatar = user?.avatar || '';
    if (avatar) {
        return `<img class="avatar-image" src="${escapeHtml(avatar)}" alt="${escapeHtml(getDisplayName(user))}">`;
    }
    return `<span class="avatar-initials">${escapeHtml(getUserInitials(user))}</span>`;
}

function getMatchActionLabel(match) {
    return match?.hasConversation ? 'Open Chat' : 'Start Chat';
}

function buildMatchAction(otherUserId, itemId = null, matchedItemId = null, matchId = null, hasConversation = false) {
    return `handleMatchChatAction('${otherUserId || ''}', ${itemId ? `'${itemId}'` : 'null'}, ${matchedItemId ? `'${matchedItemId}'` : 'null'}, ${matchId ? `'${matchId}'` : 'null'}, ${hasConversation ? 'true' : 'false'})`;
}

function formatDate(value) {
    return new Date(value).toLocaleDateString();
}

function formatTime(value) {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function normalizeCategoryLabel(value = 'other') {
    return value
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function formatMatchStrength(score = 0) {
    if (score >= 9) return 'Very strong match';
    if (score >= 6) return 'Strong match';
    if (score >= 3) return 'Possible match';
    return 'New lead';
}

function updateHeroMetrics(data) {
    const reports = data?.myItems?.length || 0;
    const matches = data?.matchSummary?.length || 0;
    const chats = data?.chatSummary?.length || 0;

    const reportsValue = document.getElementById('heroReportsValue');
    const matchesValue = document.getElementById('heroMatchesValue');
    const chatsValue = document.getElementById('heroChatsValue');

    if (reportsValue) reportsValue.textContent = String(reports);
    if (matchesValue) matchesValue.textContent = String(matches);
    if (chatsValue) chatsValue.textContent = String(chats);
}

function updateSidebarCounts(data) {
    const lostBadge = document.getElementById('lostItemsBadge');
    const foundBadge = document.getElementById('foundItemsBadge');
    const messagesBadge = document.getElementById('messagesBadge');
    const unreadCount = (data?.chatSummary || []).reduce((total, chat) => total + (chat.unread || 0), 0);

    if (lostBadge) lostBadge.textContent = String(data?.stats?.myLost ?? 0);
    if (foundBadge) foundBadge.textContent = String(data?.stats?.myFound ?? 0);
    if (messagesBadge) messagesBadge.textContent = String(unreadCount);
}

function updateDashboardStats(data) {
    const statValues = document.querySelectorAll('.stat-value');
    if (statValues.length < 4) return;

    statValues[0].textContent = String(data?.stats?.myLost ?? 0);
    statValues[1].textContent = String(data?.stats?.myFound ?? 0);
    statValues[2].textContent = String(data?.stats?.myMatches ?? 0);
    statValues[3].textContent = String(data?.stats?.activeChats ?? 0);
}

function renderNotifications(data) {
    const container = document.getElementById('notificationList');
    const dot = document.getElementById('notificationDot');
    if (!container) return;

    const notifications = [];
    const unreadMatchNotifications = (data?.notifications || []).filter((notification) => !notification.read);
    const unreadChatNotifications = (data?.chatSummary || [])
        .filter((chat) => (chat.unread || 0) > 0);

    unreadMatchNotifications.forEach((notification) => {
        notifications.push({
            key: `match-${notification._id}`,
            icon: 'match',
            title: notification.title || 'Item matched',
            text: notification.message || 'Your item has been matched. You can now chat with the user who found it.',
            action: `openChatById('${notification.matchId}', '${notification.otherUser?._id || ''}')`,
            createdAt: notification.createdAt
        });
    });

    unreadChatNotifications.forEach((chat) => {
        notifications.push({
            key: `chat-${chat.matchId}`,
            icon: 'message',
            title: `${chat.unread} unread message${chat.unread === 1 ? '' : 's'}`,
            text: `${getDisplayName(chat.otherUser)} sent you an update.`,
            action: `openChatById('${chat.matchId}', '${chat.otherUser?._id || ''}')`,
            createdAt: chat.lastMessage?.timestamp || chat.lastMessage?.createdAt || new Date().toISOString()
        });
    });

    notifications.sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));

    if (dot) {
        dot.classList.toggle('hidden', notifications.length === 0);
    }

    if (notifications.length === 0) {
        container.innerHTML = `
            <div class="dropdown-empty">
                <i data-feather="bell"></i>
                <p>No new updates yet.</p>
            </div>`;
        if (typeof feather !== 'undefined') feather.replace();
        return;
    }

    container.innerHTML = notifications.slice(0, 6).map((notification) => `
        <button class="notification-item" onclick="${notification.action}">
            <div class="notification-icon ${notification.icon}">
                <i data-feather="${notification.icon === 'message' ? 'message-square' : 'link'}"></i>
            </div>
            <div class="notification-details">
                <p class="notification-title">${escapeHtml(notification.title)}</p>
                <p class="notification-text">${escapeHtml(notification.text)}</p>
            </div>
        </button>`).join('');

    if (typeof feather !== 'undefined') feather.replace();
}

function findDashboardItem(itemId) {
    return (state.dashboard?.myItems || []).find((item) => item._id === itemId) || null;
}

function markNotificationsReadLocally(matchId) {
    if (!matchId || !state.dashboard?.notifications?.length) {
        return;
    }

    let changed = false;
    state.dashboard.notifications = state.dashboard.notifications.map((notification) => {
        if (notification.matchId === matchId && !notification.read) {
            changed = true;
            return { ...notification, read: true };
        }

        return notification;
    });

    if (changed) {
        renderNotifications(state.dashboard);
    }
}

async function loadHomePage(data = null) {
    const dashboardData = data || await fetchDashboardState();
    renderMatchHighlights(dashboardData.matchSummary || []);
    renderItemGrid(
        document.getElementById('recentItemsGrid'),
        (dashboardData.myItems || []).slice(0, 6)
    );
}

function renderMatchHighlights(matches) {
    const grid = document.getElementById('matchHighlightsGrid');
    if (!grid) return;

    if (!matches.length) {
        grid.innerHTML = renderEmptyState('link', 'No matches yet', 'When another user reports a similar item, it will appear here.');
        if (typeof feather !== 'undefined') feather.replace();
        return;
    }

    grid.innerHTML = matches.slice(0, 6).map((match) => `
        <article class="match-highlight-card">
            <p class="match-strength">${escapeHtml(formatMatchStrength(match.matchedItem?.matchScore))}</p>
            <div>
                <h3>${escapeHtml(match.myItem?.title || 'Your Item')}</h3>
                <p class="notification-text">${escapeHtml(match.myItem?.type || '')} report</p>
            </div>
            <div class="match-inline-card">
                <p>Matched with</p>
                <strong>${escapeHtml(match.matchedItem?.title || 'Potential match')}</strong>
                <p>${escapeHtml(getDisplayName(match.otherUser))}</p>
            </div>
            <button class="primary-btn" onclick="${buildMatchAction(
                match.otherUser?._id || '',
                match.myItem?._id || null,
                match.matchedItem?._id || null,
                match.matchId || null,
                Boolean(match.hasConversation)
            )}">
                ${escapeHtml(getMatchActionLabel(match))}
            </button>
        </article>`).join('');
}

async function loadLostItems(data = null) {
    const dashboardData = data || await fetchDashboardState();
    renderItemGrid(document.getElementById('lostItemsGrid'), dashboardData.myLostItems || [], { showDelete: false });
}

async function loadFoundItems(data = null) {
    const dashboardData = data || await fetchDashboardState();
    renderItemGrid(document.getElementById('foundItemsGrid'), dashboardData.myFoundItems || [], { showDelete: false });
}

async function loadMyReports() {
    try {
        const reports = await apiCall('/reports');
        renderItemGrid(document.getElementById('myItemsGrid'), reports.myItems || [], { showDelete: true });
    } catch (error) {
        renderError(document.getElementById('myItemsGrid'), error.message);
    }
}

function renderItemGrid(grid, items, options = {}) {
    if (!grid) return;
    const { showDelete = false } = options;

    if (!items || items.length === 0) {
        grid.innerHTML = renderEmptyState('inbox', 'No items found', 'Nothing matches this view yet.');
        if (typeof feather !== 'undefined') feather.replace();
        return;
    }

    grid.innerHTML = items.map((item) => createItemCard(item, { showDelete })).join('');
    if (typeof feather !== 'undefined') feather.replace();
}

function createItemCard(item, options = {}) {
    const { showDelete = false } = options;
    const reporterName = getDisplayName(item.postedBy);
    const matchCount = item.matches?.length || 0;
    const primaryMatch = item.matches?.[0] || null;
    const imageUrl = item.imageURL || item.image || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600';
    const matchClass = matchCount > 0 ? 'has-match' : 'no-match';

    return `
        <article class="item-card-shell">
            <div class="item-card-media">
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title)}" onerror="this.src='https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600'">
                <span class="item-type-badge ${String(item.type).toLowerCase()}">${escapeHtml(item.type)}</span>
                ${matchCount > 0 ? `<span class="item-match-badge">${matchCount} match${matchCount === 1 ? '' : 'es'}</span>` : ''}
            </div>
            <div class="item-card-body">
                <div class="item-card-title-row">
                    <h3>${escapeHtml(item.title)}</h3>
                    <span class="item-card-owner">${escapeHtml(reporterName)}</span>
                </div>
                <p class="item-card-description">${escapeHtml(item.description || 'No description provided.')}</p>
                <div class="item-chip-row">
                    <span class="item-chip">${escapeHtml(normalizeCategoryLabel(item.category || 'other'))}</span>
                    <span class="item-chip">${escapeHtml(item.location || 'Location not specified')}</span>
                </div>
                <div class="item-card-footer">
                    <div class="item-card-meta">
                        <span class="item-card-date">${escapeHtml(formatDate(item.date || item.createdAt))}</span>
                        <span class="item-card-match ${matchClass}">${matchCount > 0 ? `${matchCount} potential match${matchCount === 1 ? '' : 'es'}` : 'No matches yet'}</span>
                    </div>
                    <div class="item-card-actions">
                        ${primaryMatch ? `
                            <button class="primary-btn compact-btn" onclick="${buildMatchAction(
                                primaryMatch.postedBy?._id || '',
                                item._id || null,
                                primaryMatch._id || null,
                                primaryMatch.matchId || null,
                                Boolean(primaryMatch.hasConversation)
                            )}">
                                ${escapeHtml(primaryMatch.hasConversation ? 'Open Chat' : 'Chat Match')}
                            </button>` : ''}
                        ${showDelete ? `<button class="danger-btn" onclick="deleteItem('${item._id}')"><i data-feather="trash-2"></i></button>` : ''}
                        <button class="ghost-btn" onclick="showItemDetails('${item._id}')">Details</button>
                    </div>
                </div>
            </div>
        </article>`;
}

function renderEmptyState(icon, title, text) {
    return `
        <div class="empty-state">
            <i data-feather="${icon}" class="empty-icon"></i>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(text)}</p>
        </div>`;
}

function renderError(container, message) {
    if (!container) return;
    container.innerHTML = renderEmptyState('alert-circle', 'Something went wrong', message || 'Please try again.');
    if (typeof feather !== 'undefined') feather.replace();
}

function filterItemsByQuery(items, search, category) {
    const normalizedSearch = (search || '').trim().toLowerCase();
    const normalizedCategory = (category || '').trim().toLowerCase();

    return (items || []).filter((item) => {
        const haystack = [item.title, item.description, item.location].filter(Boolean).join(' ').toLowerCase();
        const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
        const matchesCategory = !normalizedCategory || (item.category || '').toLowerCase() === normalizedCategory;
        return matchesSearch && matchesCategory;
    });
}

async function filterLostItems() {
    const dashboardData = await fetchDashboardState();
    const search = document.getElementById('lostSearchInput')?.value || '';
    const category = document.getElementById('lostCategoryFilter')?.value || '';
    const items = filterItemsByQuery(dashboardData.myLostItems || [], search, category);
    renderItemGrid(document.getElementById('lostItemsGrid'), items, { showDelete: false });
}

async function filterFoundItems() {
    const dashboardData = await fetchDashboardState();
    const search = document.getElementById('foundSearchInput')?.value || '';
    const category = document.getElementById('foundCategoryFilter')?.value || '';
    const items = filterItemsByQuery(dashboardData.myFoundItems || [], search, category);
    renderItemGrid(document.getElementById('foundItemsGrid'), items, { showDelete: false });
}

async function filterAllItems(query) {
    navigateTo('lost-items', false);
    const searchInput = document.getElementById('lostSearchInput');
    if (searchInput) searchInput.value = query;
    await filterLostItems();
}

async function loadMessages(data = null) {
    const dashboardData = data || await fetchDashboardState();
    renderMatchLeadList(dashboardData.matchSummary || []);
    renderConversationList(dashboardData.chatSummary || []);

    if (!state.currentChatId && (dashboardData.chatSummary || []).length > 0) {
        const firstChat = dashboardData.chatSummary[0];
        await openChatById(firstChat.matchId, firstChat.otherUser?._id || null, { skipNavigate: true });
        return;
    }

    if (!state.currentChatId) {
        showChatEmptyState();
    }
}

function renderMatchLeadList(matches) {
    const container = document.getElementById('matchLeadList');
    if (!container) return;

    if (!(matches || []).length) {
        container.innerHTML = renderEmptyState('zap', 'No matches yet', 'Fresh matches will appear here when another user reports a similar item.');
        if (typeof feather !== 'undefined') feather.replace();
        return;
    }

    container.innerHTML = (matches || []).map((match) => `
        <button class="match-lead-card" onclick="${buildMatchAction(
            match.otherUser?._id || '',
            match.myItem?._id || null,
            match.matchedItem?._id || null,
            match.matchId || null,
            Boolean(match.hasConversation)
        )}">
            <div class="match-lead-top">
                <div class="match-lead-meta">
                    <strong>${escapeHtml(match.myItem?.title || 'Your item')}</strong>
                    <p>${escapeHtml(match.matchedItem?.title || 'Potential match')}</p>
                </div>
                <span class="match-score-pill">${escapeHtml(formatMatchStrength(match.matchedItem?.matchScore))}</span>
            </div>
            <div class="match-lead-footer">
                <span>${escapeHtml(getDisplayName(match.otherUser))}</span>
                <span class="context-pill">${escapeHtml(match.hasConversation ? 'Chat Ready' : (match.matchedItem?.type || 'Match'))}</span>
            </div>
        </button>`).join('');
}

function renderConversationList(chats) {
    const container = document.getElementById('conversationList');
    if (!container) return;

    if (!chats.length) {
        container.innerHTML = renderEmptyState('message-square', 'No conversations yet', 'Start a chat from a match lead or the item details view.');
        if (typeof feather !== 'undefined') feather.replace();
        return;
    }

    container.innerHTML = chats.map((chat) => {
        const lastMessage = chat.lastMessage?.message || chat.contextLabel || 'No messages yet';
        const activeClass = chat.matchId === state.currentChatId ? 'active' : '';

        return `
            <button class="conversation-item ${activeClass}" onclick="openChatById('${chat.matchId}', '${chat.otherUser?._id || ''}')">
                <div class="conversation-avatar">${renderAvatarMarkup(chat.otherUser)}</div>
                <div class="conversation-details">
                    <h4>${escapeHtml(getDisplayName(chat.otherUser))}</h4>
                    <p>${escapeHtml(lastMessage)}</p>
                </div>
                ${(chat.unread || 0) > 0 ? `<span class="conversation-badge">${chat.unread}</span>` : ''}
            </button>`;
    }).join('');
}

function showChatEmptyState() {
    document.getElementById('chatEmptyState')?.classList.remove('hidden');
    document.getElementById('chatThread')?.classList.add('hidden');
}

function hideChatEmptyState() {
    document.getElementById('chatEmptyState')?.classList.add('hidden');
    document.getElementById('chatThread')?.classList.remove('hidden');
}

async function startChatWithUser(userId, itemId = null, matchedItemId = null) {
    closeModal('itemDetailsModal');

    try {
        const chat = await apiCall('/chat/start', {
            method: 'POST',
            body: JSON.stringify({ otherUserId: userId, itemId, matchedItemId })
        });

        await refreshDashboardData({ announceMatches: false });
        navigateTo('messages', false);
        await loadMessages(state.dashboard);
        await openChatById(chat.matchId, userId, { skipNavigate: true });
    } catch (error) {
        showDashboardNotification(error.message || 'Could not start chat', 'error');
    }
}

async function handleMatchChatAction(otherUserId, itemId = null, matchedItemId = null, matchId = null, hasConversation = false) {
    if (!otherUserId) {
        showDashboardNotification('Could not identify the other user for this match.', 'error');
        return;
    }

    if (hasConversation && matchId) {
        await openChatById(matchId, otherUserId);
        return;
    }

    await startChatWithUser(otherUserId, itemId, matchedItemId);
}

async function openChatById(matchId, otherUserId = null, options = {}) {
    const { skipNavigate = false, fromRefresh = false } = options;

    state.currentChatId = matchId;
    state.currentReceiverId = otherUserId;

    if (!skipNavigate) {
        navigateTo('messages', false);
    }

    try {
        const chat = await apiCall(`/chat/${matchId}`);
        state.currentChat = chat;

        const currentUser = getCurrentUser();
        const otherUser = (chat.participants || []).find((participant) => participant._id !== currentUser._id) || null;
        state.currentReceiverId = otherUser?._id || state.currentReceiverId;

        renderActiveChat(chat);
        markNotificationsReadLocally(matchId);
        renderConversationList(state.dashboard?.chatSummary || []);
        if (socket?.connected && !fromRefresh) {
            socket.emit('join_chat', matchId);
        }
    } catch (error) {
        showDashboardNotification(error.message || 'Could not open conversation', 'error');
    }
}

function renderActiveChat(chat) {
    hideChatEmptyState();

    const currentUser = getCurrentUser();
    const otherUser = (chat.participants || []).find((participant) => participant._id !== currentUser._id) || null;
    const title = document.getElementById('chatThreadTitle');
    const subtitle = document.getElementById('chatThreadSubtitle');
    const avatar = document.getElementById('chatPartnerAvatar');
    const contextTags = document.getElementById('chatContextTags');

    if (title) title.textContent = getDisplayName(otherUser);
    if (subtitle) subtitle.textContent = chat.relatedItems?.length
        ? `Talking about ${chat.relatedItems.map((item) => item.title).join(', ')}`
        : 'Direct conversation';
    if (avatar) avatar.innerHTML = renderAvatarMarkup(otherUser);
    if (contextTags) {
        contextTags.innerHTML = (chat.relatedItems || []).map((item) => `
            <span class="context-pill">${escapeHtml(item.type)}: ${escapeHtml(item.title)}</span>`).join('');
    }

    displayChatMessages(chat.messages || []);
    if (typeof feather !== 'undefined') feather.replace();
}

function displayChatMessages(messages) {
    const container = document.getElementById('chatMessages');
    const currentUser = getCurrentUser();
    if (!container) return;

    if (!messages.length) {
        container.innerHTML = renderEmptyState('message-circle', 'No messages yet', 'Start the conversation and confirm the item details.');
        if (typeof feather !== 'undefined') feather.replace();
        return;
    }

    container.innerHTML = messages.map((message) => {
        const senderId = message.sender?._id || message.sender;
        const isMine = senderId === currentUser._id;
        const rowClass = isMine ? 'mine' : 'other';

        return `
            <div class="chat-message-row ${rowClass}">
                <div class="chat-bubble">
                    <div class="chat-bubble-header">${escapeHtml(isMine ? 'You' : getDisplayName(message.sender))}</div>
                    <div class="chat-bubble-text">${escapeHtml(message.message || '')}</div>
                    <div class="chat-bubble-time">${escapeHtml(formatTime(message.timestamp || message.createdAt || Date.now()))}</div>
                </div>
            </div>`;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput?.value.trim();

    if (!message || !state.currentChatId) {
        return;
    }

    const receiverId = state.currentReceiverId || resolveReceiverIdFromMatchId(state.currentChatId);
    if (!receiverId) {
        showDashboardNotification('Could not identify the chat recipient.', 'error');
        return;
    }

    if (socket?.connected) {
        socket.emit('send_message', {
            matchId: state.currentChatId,
            receiverId,
            message
        });
    } else {
        try {
            const updatedChat = await apiCall(`/chat/${state.currentChatId}/messages`, {
                method: 'POST',
                body: JSON.stringify({ receiverId, message })
            });

            state.currentChat = updatedChat;
            renderActiveChat(updatedChat);
            await refreshDashboardData({ announceMatches: false });
        } catch (error) {
            showDashboardNotification(error.message || 'Could not send message', 'error');
            return;
        }
    }

    if (messageInput) {
        messageInput.value = '';
        messageInput.focus();
    }
}

function resolveReceiverIdFromMatchId(matchId) {
    const currentUser = getCurrentUser();
    return String(matchId || '')
        .split('_')
        .find((id) => id && id !== currentUser._id) || null;
}

async function showItemDetails(itemId) {
    try {
        const item = findDashboardItem(itemId) || await apiCall(`/items/${itemId}`);
        const imageUrl = item.imageURL || item.image || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=800';
        const currentUser = getCurrentUser();
        const isOwnItem = item.postedBy?._id === currentUser._id;
        const modal = document.getElementById('itemDetailsModal');
        const container = modal?.querySelector('.item-details-content');

        if (!modal || !container) return;

        container.innerHTML = `
            <div class="item-detail-header">
                <div>
                    <p class="eyebrow">${escapeHtml(item.type)} Report</p>
                    <h2 class="page-title">${escapeHtml(item.title)}</h2>
                </div>
                <button class="modal-close" onclick="closeModal('itemDetailsModal')"><i data-feather="x"></i></button>
            </div>
            <img class="item-detail-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title)}" onerror="this.src='https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=800'">
            <div class="item-detail-grid">
                <div class="item-detail-panel">
                    <label>Category</label>
                    <p>${escapeHtml(normalizeCategoryLabel(item.category || 'other'))}</p>
                </div>
                <div class="item-detail-panel">
                    <label>Date</label>
                    <p>${escapeHtml(formatDate(item.date || item.createdAt))}</p>
                </div>
                <div class="item-detail-panel full">
                    <label>Description</label>
                    <p>${escapeHtml(item.description || 'No description provided.')}</p>
                </div>
                <div class="item-detail-panel full">
                    <label>Location</label>
                    <p>${escapeHtml(item.location || 'Not specified')}</p>
                </div>
                <div class="item-detail-panel full">
                    <label>Reported By</label>
                    <div class="item-detail-reporter">
                        <div class="conversation-avatar">${renderAvatarMarkup(item.postedBy)}</div>
                        <div>
                            <strong>${escapeHtml(getDisplayName(item.postedBy))}</strong>
                            <p>${escapeHtml(item.postedBy?.email || 'No email available')}</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="match-action-group">
                ${isOwnItem
                    ? renderMatchActionGroup(item)
                    : `<button class="primary-btn" onclick="startChatWithUser('${item.postedBy?._id || ''}', '${item._id}')">Message Reporter</button>`}
            </div>`;

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (typeof feather !== 'undefined') feather.replace();
    } catch (error) {
        showDashboardNotification(error.message || 'Could not load item details', 'error');
    }
}

function renderMatchActionGroup(item) {
    const matches = item.matches || [];

    if (!matches.length) {
        return `
            <div class="item-detail-panel full">
                <label>No match yet</label>
                <p>When someone posts a matching ${escapeHtml(item.type === 'Lost' ? 'found' : 'lost')} item, it will show up here for both users.</p>
            </div>`;
    }

    return matches.map((match) => `
        <div class="match-action-card">
            <div class="match-action-copy">
                <strong>${escapeHtml(match.title)}</strong>
                <p>${escapeHtml(getDisplayName(match.postedBy))} reported this ${escapeHtml(match.type)} item. ${match.hasConversation ? 'Your chat is already ready.' : 'Start a chat to coordinate the return.'}</p>
            </div>
            <button class="primary-btn" onclick="${buildMatchAction(
                match.postedBy?._id || '',
                item._id || null,
                match._id || null,
                match.matchId || null,
                Boolean(match.hasConversation)
            )}">
                ${escapeHtml(match.hasConversation ? 'Open Chat' : 'Chat Now')}
            </button>
        </div>`).join('');
}

async function handleReportSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const payload = new FormData();
    const submitButton = form.querySelector('.primary-btn');
    const originalLabel = submitButton?.innerHTML || '';
    const endpoint = formData.get('type') === 'Lost' ? '/items/lost' : '/items/found';

    ['title', 'category', 'description', 'location', 'date'].forEach((field) => {
        payload.append(field, formData.get(field) || '');
    });

    const imageFile = formData.get('image');
    if (imageFile && imageFile.name) {
        payload.append('image', imageFile);
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<span>Saving...</span>';
    }

    try {
        const result = await apiCall(endpoint, {
            method: 'POST',
            body: payload
        });

        invalidateDashboardState();
        const refreshedData = await fetchDashboardState(true);
        closeModal('reportModal');
        form.reset();
        const label = document.getElementById('reportImageLabel');
        if (label) label.textContent = 'Click to upload a clear photo';

        showDashboardNotification(
            result.matches?.length
                ? `${result.matches.length} potential match${result.matches.length === 1 ? '' : 'es'} found for your report`
                : 'Report submitted successfully',
            'success'
        );

        if (result.matches?.length) {
            navigateTo('messages', false);
            await loadMessages(refreshedData);
        } else {
            await rerenderActivePage(refreshedData);
        }
    } catch (error) {
        showDashboardNotification(error.message || 'Could not submit report', 'error');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = originalLabel;
            if (typeof feather !== 'undefined') feather.replace();
        }
    }
}

async function deleteItem(itemId) {
    if (!confirm('Delete this report?')) return;

    try {
        await apiCall(`/items/${itemId}`, { method: 'DELETE' });
        invalidateDashboardState();
        await refreshDashboardData({ announceMatches: false });
        showDashboardNotification('Report deleted', 'success');
    } catch (error) {
        showDashboardNotification(error.message || 'Could not delete report', 'error');
    }
}

function getPendingChat() {
    const matchId = localStorage.getItem('pendingChatId');
    const otherUserId = localStorage.getItem('pendingChatUserId');
    return matchId ? { matchId, otherUserId } : null;
}

function clearPendingChat() {
    localStorage.removeItem('pendingChatId');
    localStorage.removeItem('pendingChatUserId');
}

async function maybeOpenPendingChat() {
    const pending = getPendingChat();
    if (!pending) return;

    clearPendingChat();
    navigateTo('messages', false);
    await loadMessages(state.dashboard);
    await openChatById(pending.matchId, pending.otherUserId || null, { skipNavigate: true });
}

function updateProfileDisplay(user = getCurrentUser()) {
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileStudentId = document.getElementById('profileStudentId');
    const profileContact = document.getElementById('profileContact');
    const userName = document.getElementById('userName');
    const topUserAvatar = document.getElementById('topUserAvatar');
    const profileAvatar = document.getElementById('profileAvatarLarge');

    if (profileName) profileName.textContent = getDisplayName(user);
    if (profileEmail) profileEmail.textContent = user?.email || 'N/A';
    if (profileStudentId) profileStudentId.textContent = user?.studentId || 'N/A';
    if (profileContact) profileContact.textContent = user?.contact || 'N/A';
    if (userName) userName.textContent = getDisplayName(user);
    if (topUserAvatar) topUserAvatar.innerHTML = renderAvatarMarkup(user);
    if (profileAvatar) profileAvatar.innerHTML = renderAvatarMarkup(user);
}

function triggerProfilePhotoUpload() {
    document.getElementById('profilePhotoInput')?.click();
}

async function handleProfilePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);

    try {
        const updatedUser = await apiCall('/profile/edit', {
            method: 'PUT',
            body: formData
        });
        setCurrentUser(updatedUser);
        showDashboardNotification('Profile photo updated', 'success');
    } catch (error) {
        showDashboardNotification(error.message || 'Could not update photo', 'error');
    } finally {
        event.target.value = '';
    }
}

function editProfile() {
    const modal = document.getElementById('editProfileModal') || createEditProfileModal();
    const user = getCurrentUser();

    modal.querySelector('#editFirstName').value = user.firstName || '';
    modal.querySelector('#editLastName').value = user.lastName || '';
    modal.querySelector('#editEmail').value = user.email || '';
    modal.querySelector('#editStudentId').value = user.studentId || '';
    modal.querySelector('#editContact').value = user.contact || '';

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function createEditProfileModal() {
    const modal = document.createElement('div');
    modal.id = 'editProfileModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeEditProfileModal()"></div>
        <div class="modal-container">
            <div class="modal-header">
                <h3 class="modal-title">Edit Profile</h3>
                <button class="modal-close" onclick="closeEditProfileModal()"><i data-feather="x"></i></button>
            </div>
            <form id="editProfileForm" class="modal-content">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">First Name</label>
                        <input id="editFirstName" name="firstName" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Last Name</label>
                        <input id="editLastName" name="lastName" class="form-control" required>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input id="editEmail" class="form-control" disabled>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Student ID</label>
                        <input id="editStudentId" class="form-control" disabled>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Contact</label>
                    <input id="editContact" name="contact" class="form-control" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="secondary-btn" onclick="closeEditProfileModal()">Cancel</button>
                    <button type="submit" class="primary-btn"><i data-feather="check"></i> Save Changes</button>
                </div>
            </form>
        </div>`;

    document.body.appendChild(modal);
    modal.querySelector('#editProfileForm').addEventListener('submit', handleProfileUpdate);

    if (typeof feather !== 'undefined') feather.replace();
    return modal;
}

async function handleProfileUpdate(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    try {
        const updatedUser = await apiCall('/profile/edit', {
            method: 'PUT',
            body: JSON.stringify({
                firstName: formData.get('firstName') || '',
                lastName: formData.get('lastName') || '',
                contact: formData.get('contact') || ''
            })
        });

        setCurrentUser(updatedUser);
        closeEditProfileModal();
        showDashboardNotification('Profile updated', 'success');
    } catch (error) {
        showDashboardNotification(error.message || 'Could not update profile', 'error');
    }
}

function closeEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('active');
}

function toggleNotifications() {
    document.getElementById('notificationDropdown')?.classList.toggle('active');
    document.getElementById('userDropdown')?.classList.remove('active');
}

function toggleUserMenu() {
    document.getElementById('userDropdown')?.classList.toggle('active');
    document.getElementById('notificationDropdown')?.classList.remove('active');
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (typeof feather !== 'undefined') feather.replace();
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

function openCampusFeed() {
    window.location.href = 'main%20app.html';
}

function handleLogout() {
    clearAuthState();
    window.location.href = 'auth.html';
}

function showDashboardNotification(message, type = 'info') {
    const colors = {
        success: 'linear-gradient(135deg, #16a34a, #22c55e)',
        error: 'linear-gradient(135deg, #ef4444, #f97316)',
        info: 'linear-gradient(135deg, #0f766e, #0ea5e9)'
    };

    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: calc(var(--topnav-height, 78px) + 1rem);
        right: 1.5rem;
        max-width: 360px;
        padding: 1rem 1.2rem;
        border-radius: 16px;
        color: white;
        font-weight: 700;
        background: ${colors[type] || colors.info};
        box-shadow: 0 24px 40px rgba(15, 23, 42, 0.2);
        z-index: 200;
        animation: toastSlide 0.25s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4200);
}

const toastStyles = document.createElement('style');
toastStyles.textContent = `
    @keyframes toastSlide {
        from { transform: translateY(-10px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
`;
document.head.appendChild(toastStyles);
