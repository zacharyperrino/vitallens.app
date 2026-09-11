// Health Chat — frontend that talks to /api/health-copilot
import { store } from '../store.js';
import { icons } from '../icons.js';
import { chatHistory } from '../lib/db.js';
import { apiFetch } from '../utils/api.js';
import { trackEvent } from '../utils/analytics-events.js';
import { esc } from '../utils/esc.js';

let messages = [];
let historyLoadFailed = false;

const DEFAULT_CHIPS = ['What did I eat today?', 'Run correlation analysis', 'Generate weekly report', 'Run predictions'];

export async function renderHealthChat() {
  const content = document.getElementById('page-content');

  content.innerHTML = `
  <div class="chat-page">
    <div class="chat-header">
      <div class="chat-header-avatar" aria-hidden="true"><span style="color:var(--accent);display:flex;">${icons.sparkle}</span></div>
      <div class="chat-header-info">
        <h2>Health Copilot</h2>
        <span class="chat-status-dot" aria-hidden="true"></span>
        <span class="chat-status-text" id="chat-status-text" role="status" aria-live="polite">Uses your logged data</span>
      </div>
      <button type="button" class="chat-clear-btn" id="chat-clear" title="Clear chat" aria-label="Clear chat history">${icons.x}</button>
    </div>
    <p class="disclaimer" style="padding:0 var(--space-4) var(--space-2);">Wellness reflections based on what you log — not medical advice. For health concerns, talk to a qualified professional.</p>

    <div class="chat-messages" id="chat-messages" role="log" aria-live="polite" aria-label="Conversation">
      <div class="chat-empty" role="status"><span class="spinner" style="display:inline-block;width:16px;height:16px;border-width:2px;vertical-align:middle;margin-right:var(--space-2);"></span>Loading your conversation…</div>
    </div>

    <div class="chat-suggestions" id="chat-suggestions" role="group" aria-label="Suggested questions"></div>

    <div class="chat-input-bar">
      <label for="chat-input" class="visually-hidden">Message the copilot</label>
      <textarea id="chat-input" class="chat-input" placeholder="Ask about what you've logged…" rows="1"></textarea>
      <button type="button" id="chat-send" class="chat-send-btn">Send</button>
    </div>
  </div>`;

  await loadChatHistory();
  renderMessages();
  attachHandlers();
  renderSuggestionsForLastMessage();
  scrollToBottom();
}

async function loadChatHistory() {
  historyLoadFailed = false;
  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data } = await supabase.auth.getUser();
    const userId = data?.user?.id;
    if (!userId) throw new Error('Not authenticated');

    const rows = await chatHistory.getRecent(20);
    messages = Array.isArray(rows)
      ? rows.map(item => ({
          role: item.role,
          text: item.content,
          timestamp: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
          toolBadge: plainBadge(item.tool_badge),
        }))
      : [];

    store.set('chatHistory', messages.slice(-50));
  } catch (err) {
    console.warn('[HealthChat] Supabase load failed:', err.message);
    historyLoadFailed = true;
    let saved;
    try {
      const raw = store.get('chatHistory') || [];
      saved = Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
    } catch { saved = []; }
    messages = (Array.isArray(saved) ? saved.slice(-20) : []).map(m => ({ ...m, toolBadge: plainBadge(m.toolBadge) }));
  }
}

// Tool badges are stored as plain text. Older cached entries may still hold
// pre-rendered HTML — strip tags so nothing stored is ever injected as markup.
function plainBadge(value) {
  if (!value) return '';
  return String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function renderMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  if (historyLoadFailed && messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state" role="alert">
        <h3>Couldn't load your conversation</h3>
        <p>Check your connection and try again. Your past messages are safe.</p>
        <button type="button" class="btn btn-sm" id="chat-history-retry">Try again</button>
      </div>`;
    document.getElementById('chat-history-retry')?.addEventListener('click', () => renderHealthChat());
    return;
  }

  if (messages.length === 0) {
    container.innerHTML = `<div class="chat-empty">Ask about what you've logged — meals, sleep, habits, and how they line up.</div>`;
    return;
  }

  const notice = historyLoadFailed
    ? `<div class="chat-empty text-xs" role="status">Showing messages saved on this device — the server couldn't be reached. <button type="button" class="btn btn-sm" id="chat-history-retry" style="margin-left:var(--space-2);">Try again</button></div>`
    : '';
  container.innerHTML = notice + messages.map(renderMessage).join('');
  document.getElementById('chat-history-retry')?.addEventListener('click', () => renderHealthChat());
}

function renderMessage(m) {
  const time = new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (m.role === 'user') {
    return `<div class="chat-bubble chat-bubble-user"><div class="chat-bubble-content">${esc(m.text)}</div><div class="chat-bubble-time">${esc(time)}</div></div>`;
  }

  const content = formatResponse(m.text || '');
  const badgeText = plainBadge(m.toolBadge);
  const badge = badgeText ? `<div class="chat-tool-badge"><span>${esc(badgeText)}</span></div>` : '';
  return `<div class="chat-bubble chat-bubble-assistant"><div class="chat-bubble-avatar" style="color:var(--accent);" aria-hidden="true">${icons.sparkle}</div><div class="chat-bubble-body">${badge}<div class="chat-bubble-content">${content}</div><div class="chat-bubble-time">${esc(time)}</div></div></div>`;
}

// Escape first, then apply the tiny markdown subset on the escaped text so
// the tags we add are the only markup that ever reaches innerHTML.
function inline(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function formatResponse(text) {
  if (!text) return '';
  const lines = String(text).split('\n');
  const out = [];
  for (const line of lines) {
    if (/^###\s+/.test(line)) {
      out.push(`<h4>${inline(line.replace(/^###\s+/, ''))}</h4>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      out.push(`<h3 class="chat-section-title">${inline(line.replace(/^##\s+/, ''))}</h3>`);
      continue;
    }
    if (/^>\s+/.test(line)) {
      out.push(`<div class="chat-callout">${inline(line.replace(/^>\s+/, ''))}</div>`);
      continue;
    }
    if (/^(•|-|\*)\s+/.test(line)) {
      out.push(`<div class="chat-list-item">${inline(line.replace(/^(•|-|\*)\s+/, ''))}</div>`);
      continue;
    }
    if (!line.trim()) continue;
    out.push(`<p>${inline(line)}</p>`);
  }
  return out.join('');
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    const el = document.getElementById('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function saveHistory() {
  try {
    store.set('chatHistory', messages.slice(-50));
  } catch (err) {
    console.warn('[HealthChat] Failed to save cache', err);
  }
}

function renderTyping() {
  const el = document.getElementById('chat-messages');
  if (!el) return;
  const existing = document.getElementById('typing-indicator');
  if (existing) return;
  el.insertAdjacentHTML('beforeend', `<div id="typing-indicator" class="chat-bubble chat-bubble-assistant" role="status"><div class="chat-bubble-avatar" style="color:var(--accent);" aria-hidden="true">${icons.sparkle}</div><div class="chat-bubble-body"><div class="chat-typing-dots" aria-hidden="true"><span></span><span></span><span></span></div><span class="visually-hidden">Copilot is thinking</span></div></div>`);
  scrollToBottom();
}

function removeTyping() {
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
}

function removeSendError() {
  document.getElementById('chat-send-error')?.remove();
}

function renderSendError(originalText, reason) {
  removeSendError();
  const el = document.getElementById('chat-messages');
  if (!el) return;
  el.insertAdjacentHTML('beforeend', `
    <div id="chat-send-error" class="chat-bubble chat-bubble-assistant" role="alert">
      <div class="chat-bubble-avatar" style="color:var(--error);" aria-hidden="true">${icons.alert}</div>
      <div class="chat-bubble-body">
        <div class="chat-bubble-content empty-state" style="padding:var(--space-3);align-items:flex-start;text-align:left;">
          <h3 style="font-size:var(--text-sm);">Couldn't send that message</h3>
          <p class="text-xs">${esc(reason)}</p>
          <button type="button" class="btn btn-sm" id="chat-retry">Try again</button>
        </div>
      </div>
    </div>`);
  document.getElementById('chat-retry')?.addEventListener('click', () => sendMessage(originalText, { retry: true }));
  scrollToBottom();
}

async function appendChatMessage(role, text) {
  if (!text) return null;
  try {
    const row = await chatHistory.append(role, text);
    saveHistory();
    return row;
  } catch (err) {
    console.warn(`[HealthChat] Failed to append ${role} message:`, err.message || err);
    saveHistory();
    return null;
  }
}

async function deleteChatHistory() {
  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data } = await supabase.auth.getUser();
    const userId = data?.user?.id;
    if (!userId) throw new Error('Not authenticated');
    const { error } = await supabase.from('chat_history').delete().eq('user_id', userId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[HealthChat] Failed to clear chat history from Supabase:', err.message || err);
    return false;
  }
}

let sending = false;

async function sendMessage(text, { retry = false } = {}) {
  if (!text || !text.trim() || sending) return;
  sending = true;
  const trimmed = text.trim();
  const container = document.getElementById('chat-messages');
  const status = document.getElementById('chat-status-text');
  removeSendError();

  if (!retry) {
    const userMsg = { role: 'user', text: trimmed, timestamp: Date.now() };
    messages.push(userMsg);
    container?.querySelector('.chat-empty')?.remove();
    if (container) container.insertAdjacentHTML('beforeend', renderMessage(userMsg));
    scrollToBottom();
    saveHistory();
    appendChatMessage('user', trimmed);
  }

  renderTyping();
  const sug = document.getElementById('chat-suggestions'); if (sug) sug.innerHTML = '';
  const input = document.getElementById('chat-input'); if (input) input.value = '';

  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data } = await supabase.auth.getUser();
    const userId = data?.user?.id;

    const res = await apiFetch(`/api/health-copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, message: trimmed, history: messages.slice(-20) }),
    });

    removeTyping();

    if (!res.ok) {
      const err = new Error(res.status === 429
        ? "You've sent a lot of messages in a short time. Wait a moment and try again."
        : "The copilot couldn't answer just now. Try again in a moment.");
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    const reply = json.reply || json.response || '';
    const toolsUsed = Array.isArray(json.toolsUsed) ? json.toolsUsed : (json.toolsUsed ? [json.toolsUsed] : []);

    let toolBadge = '';
    if (toolsUsed.length) {
      const labels = {
        log_meal: 'Meal logged',
        log_sleep: 'Sleep logged',
        log_exercise: 'Exercise logged',
        add_supplement: 'Supplement added',
        lookup_nutrition: 'Nutrition looked up',
        run_correlation_analysis: 'Correlations found',
        generate_weekly_report: 'Report generated',
        run_predictions: 'Predictions updated',
        get_todays_summary: 'Summary fetched',
      };
      toolBadge = toolsUsed.map(t => labels[t] || String(t)).join(' · ');
    }

    if (!reply) {
      throw new Error('The copilot sent back an empty reply. Try asking again.');
    }

    const assistantMsg = { role: 'assistant', text: reply, timestamp: Date.now(), toolBadge };
    messages.push(assistantMsg);
    if (container) container.insertAdjacentHTML('beforeend', renderMessage(assistantMsg));
    if (status) status.textContent = 'Uses your logged data';
    scrollToBottom();

    appendChatMessage('assistant', reply);
    renderSuggestionsForTools(toolsUsed);
    saveHistory();
    trackEvent('copilot_message_sent', { userId });
  } catch (err) {
    removeTyping();
    console.warn('[health-chat]', err.message || err);
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const reason = timedOut
      ? 'It took too long to get a reply. Check your connection and try again.'
      : (err?.status || /empty reply/.test(err?.message || '')) ? err.message
      : "We couldn't reach the copilot. Check your connection and try again.";
    if (status) status.textContent = 'Connection problem';
    renderSendError(trimmed, reason);
    renderSuggestionsForTools([]);
  } finally {
    sending = false;
  }
}

function renderChips(chips) {
  const container = document.getElementById('chat-suggestions');
  if (!container) return;
  container.innerHTML = chips.map(c => `<button type="button" class="chat-chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('');
  attachChipHandlers();
}

function renderSuggestionsForTools(toolsUsed = []) {
  const mapping = {
    log_meal: ['How are my macros today?', 'What should I eat next?', 'Am I on target?'],
    log_sleep: ['How does this affect my energy?', 'My sleep trend?', 'Tips for better sleep?'],
    log_exercise: ['How is my recovery?', 'Protein needs today?', 'Weekly training summary'],
    run_correlation_analysis: ['What should I do about this?', 'Show predictions', 'Weekly report'],
    run_predictions: ['Top intervention for me?', 'What is declining?', 'Run correlations'],
  };

  let chips = [];
  for (const t of toolsUsed) {
    if (mapping[t]) { chips = mapping[t]; break; }
  }
  if (!chips.length) chips = DEFAULT_CHIPS;
  renderChips(chips);
}

function renderSuggestionsForLastMessage() {
  const last = [...messages].reverse().find(m => m.role === 'assistant');
  if (!last) {
    renderChips(DEFAULT_CHIPS);
    return;
  }
  const tools = [];
  if (/meal logged|meal/i.test(last.text)) tools.push('log_meal');
  if (/sleep/i.test(last.text) && /logged|sleep/i.test(last.text)) tools.push('log_sleep');
  if (/exercise|workout|training/i.test(last.text)) tools.push('log_exercise');
  renderSuggestionsForTools(tools);
}

function attachChipHandlers() {
  document.querySelectorAll('.chat-chip').forEach(chip => {
    if (chip._handler) chip.removeEventListener('click', chip._handler);
    const handler = () => sendMessage(chip.dataset.chip);
    chip._handler = handler;
    chip.addEventListener('click', handler);
  });
}

function attachHandlers() {
  const sendBtn = document.getElementById('chat-send');
  const input = document.getElementById('chat-input');
  const clearBtn = document.getElementById('chat-clear');

  sendBtn?.addEventListener('click', () => sendMessage(input?.value));

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });

  clearBtn?.addEventListener('click', async () => {
    if (!confirm("Delete every message in this chat? They can't be brought back.")) return;
    const ok = await deleteChatHistory();
    if (!ok) {
      const status = document.getElementById('chat-status-text');
      if (status) status.textContent = "Couldn't clear the chat — try again";
      return;
    }
    messages = [];
    try { store.set('chatHistory', []); } catch (err) { console.warn(err); }
    renderHealthChat();
  });

  attachChipHandlers();
  input?.focus();
}
