// Health Chat — frontend that talks to /api/health-copilot
import { store } from '../store.js';
import { icons } from '../icons.js';
import { chatHistory } from '../lib/db.js';
import { apiFetch } from '../utils/api.js';
import { trackEvent } from '../utils/analytics-events.js';

let messages = [];

export async function renderHealthChat() {
  const content = document.getElementById('page-content');

  content.innerHTML = `
  <div class="chat-page">
    <div class="chat-header">
      <div class="chat-header-avatar"><span style="color:var(--accent);display:flex;">${icons.sparkle}</span></div>
      <div class="chat-header-info">
        <h2>Health Copilot</h2>
        <span class="chat-status-dot"></span>
        <span class="chat-status-text">Online • Analyzing your data</span>
      </div>
      <button class="chat-clear-btn" id="chat-clear" title="Clear chat">${icons.refresh}</button>
    </div>

    <div class="chat-messages" id="chat-messages"></div>

    <div class="chat-suggestions" id="chat-suggestions"></div>

    <div class="chat-input-bar">
      <textarea id="chat-input" class="chat-input" placeholder="Ask about your health..." rows="1"></textarea>
      <button id="chat-send" class="chat-send-btn">Send</button>
    </div>
  </div>`;

  await loadChatHistory();
  renderMessages();
  attachHandlers();
  renderSuggestionsForLastMessage();
  scrollToBottom();
}

async function loadChatHistory() {
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
          toolBadge: item.tool_badge || '',
        }))
      : [];

    store.set('chatHistory', messages.slice(-50));
  } catch (err) {
    console.warn('[HealthChat] Supabase load failed:', err.message);
    const saved = store.get('chatHistory') || [];
    messages = Array.isArray(saved)
      ? saved.slice(-20)
      : (saved ? JSON.parse(saved).slice(-20) : []);
  }
}

function renderMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  if (messages.length === 0) {
    container.innerHTML = `<div class="chat-empty">Ask me anything about your health.</div>`;
    return;
  }
  container.innerHTML = messages.map(renderMessage).join('');
}

function renderMessage(m) {
  const time = new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (m.role === 'user') {
    return `<div class="chat-bubble chat-bubble-user"><div class="chat-bubble-content">${escapeHtml(m.text)}</div><div class="chat-bubble-time">${time}</div></div>`;
  }

  const content = formatResponse(m.text || '');
  const badge = m.toolBadge ? m.toolBadge : '';
  return `<div class="chat-bubble chat-bubble-assistant"><div class="chat-bubble-avatar" style="color:var(--accent);">${icons.sparkle}</div><div class="chat-bubble-body">${badge}<div class="chat-bubble-content">${content}</div><div class="chat-bubble-time">${time}</div></div></div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatResponse(text) {
  if (!text) return '';
  const lines = String(text).split('\n');
  const out = [];
  for (let line of lines) {
    if (/^###\s+/.test(line)) {
      out.push(`<h4>${escapeHtml(line.replace(/^###\s+/, ''))}</h4>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      out.push(`<h3 class="chat-section-title">${escapeHtml(line.replace(/^##\s+/, ''))}</h3>`);
      continue;
    }
    if (/^>\s+/.test(line)) {
      out.push(`<div class="chat-callout">${escapeHtml(line.replace(/^>\s+/, ''))}</div>`);
      continue;
    }
    if (/^•\s+/.test(line)) {
      out.push(`<div class="chat-list-item">${escapeHtml(line.replace(/^•\s+/, ''))}</div>`);
      continue;
    }
    line = line.replace(/\*\*(.+?)\*\*/g, (_, p1) => `<strong>${escapeHtml(p1)}</strong>`);
    out.push(`<p>${line.split(/\n/).map(escapeHtml).join('<br/>')}</p>`);
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
  el.insertAdjacentHTML('beforeend', `<div id="typing-indicator" class="chat-bubble chat-bubble-assistant"><div class="chat-bubble-avatar" style="color:var(--accent);">${icons.sparkle}</div><div class="chat-bubble-body"><div class="chat-typing-dots"><span></span><span></span><span></span></div></div></div>`);
  scrollToBottom();
}

function removeTyping() {
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
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
    await supabase.from('chat_history').delete().eq('user_id', userId);
  } catch (err) {
    console.warn('[HealthChat] Failed to clear chat history from Supabase:', err.message || err);
  }
}

async function sendMessage(text) {
  if (!text || !text.trim()) return;
  const trimmed = text.trim();
  const userMsg = { role: 'user', text: trimmed, timestamp: Date.now() };
  messages.push(userMsg);
  const container = document.getElementById('chat-messages');
  if (container) container.insertAdjacentHTML('beforeend', renderMessage(userMsg));
  scrollToBottom();
  saveHistory();

  renderTyping();
  const sug = document.getElementById('chat-suggestions'); if (sug) sug.innerHTML = '';
  const input = document.getElementById('chat-input'); if (input) input.value = '';

  appendChatMessage('user', trimmed);

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

    if (!res.ok) throw new Error('server');
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
      const parts = toolsUsed.map(t => labels[t] || t);
      toolBadge = `<div class="chat-tool-badge"><span>${escapeHtml(parts.join(' · '))}</span></div>`;
    }

    const assistantMsg = { role: 'assistant', text: reply, timestamp: Date.now(), toolBadge };
    messages.push(assistantMsg);
    if (container) container.insertAdjacentHTML('beforeend', renderMessage(assistantMsg));
    scrollToBottom();

    appendChatMessage('assistant', reply);
    renderSuggestionsForTools(toolsUsed);
    saveHistory();
    trackEvent('copilot_message_sent', { userId });
  } catch (err) {
    removeTyping();
    const errMsg = { role: 'assistant', text: 'I had trouble connecting. Check that the server is running and try again.', timestamp: Date.now() };
    messages.push(errMsg);
    const container = document.getElementById('chat-messages');
    if (container) container.insertAdjacentHTML('beforeend', renderMessage(errMsg));
    scrollToBottom();
    console.error('[health-chat]', err.message || err);
    saveHistory();
  }
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
  if (!chips.length) chips = ['What did I eat today?', 'Run correlation analysis', 'Generate weekly report', 'Run predictions'];

  const container = document.getElementById('chat-suggestions');
  if (!container) return;
  container.innerHTML = chips.map(c => `<button class="chat-chip" data-chip="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');
  attachChipHandlers();
}

function renderSuggestionsForLastMessage() {
  const last = [...messages].reverse().find(m => m.role === 'assistant');
  if (!last) {
    const container = document.getElementById('chat-suggestions');
    if (container) container.innerHTML = ['What did I eat today?', 'Run correlation analysis', 'Generate weekly report', 'Run predictions'].map(c => `<button class="chat-chip" data-chip="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');
    attachChipHandlers();
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
    chip.removeEventListener('click', chip._handler);
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
    if (confirm('Clear the chat history for this user?')) {
      await deleteChatHistory();
      messages = [];
      try { store.set('chatHistory', []); } catch (err) { console.warn(err); }
      renderHealthChat();
    }
  });

  attachChipHandlers();
  input?.focus();
}
