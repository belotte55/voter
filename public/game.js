const socket = io();
const gameId = window.location.pathname.split('/')[2];
const params = new URLSearchParams(window.location.search);
const urlName = params.get('name');
const urlSpectator = params.get('spectator') === '1';

const joinPrompt = document.getElementById('joinPrompt');
const gameContent = document.getElementById('gameContent');
const joinForm = document.getElementById('joinForm');
const playerNameInput = document.getElementById('playerName');
const joinAsSpectatorCheck = document.getElementById('joinAsSpectator');

const gameNameEl = document.getElementById('gameName');
const gameUrlEl = document.getElementById('gameUrl');
const copyUrlBtn = document.getElementById('copyUrl');
const participantsList = document.getElementById('participantsList');
const participantCount = document.getElementById('participantCount');
const issuesList = document.getElementById('issuesList');
const addIssueBtn = document.getElementById('addIssueBtn');
const facilitatorSection = document.getElementById('facilitatorSection');

const currentIssueTitle = document.getElementById('currentIssueTitle');
const currentIssueDesc = document.getElementById('currentIssueDesc');
const voteCards = document.getElementById('voteCards');
const votingArea = document.getElementById('votingArea');
const voteTimerEl = document.getElementById('voteTimer');
const resultsArea = document.getElementById('resultsArea');
const resultsGrid = document.getElementById('resultsGrid');
const revealBtn = document.getElementById('revealBtn');
const resetBtn = document.getElementById('resetBtn');
const prevIssueBtn = document.getElementById('prevIssueBtn');
const nextIssueBtn = document.getElementById('nextIssueBtn');
const startTimerBtn = document.getElementById('startTimerBtn');
const timerSecondsInput = document.getElementById('timerSeconds');
const exportBtn = document.getElementById('exportBtn');

const addIssueModal = document.getElementById('addIssueModal');
const addIssueForm = document.getElementById('addIssueForm');
const newIssueTitle = document.getElementById('newIssueTitle');
const newIssueDesc = document.getElementById('newIssueDesc');
const cancelAddIssue = document.getElementById('cancelAddIssue');

const editIssueModal = document.getElementById('editIssueModal');
const editIssueForm = document.getElementById('editIssueForm');
const editIssueIdInput = document.getElementById('editIssueId');
const editIssueTitleInput = document.getElementById('editIssueTitleInput');
const editIssueDescInput = document.getElementById('editIssueDescInput');
const cancelEditIssue = document.getElementById('cancelEditIssue');
const deleteIssueBtn = document.getElementById('deleteIssueBtn');

const themeToggle = document.getElementById('themeToggle');
const connectionIndicatorContainer = document.getElementById('connectionIndicator');

let currentGame = null;
let mySocketId = null;
let joined = false;
let voteTimerInterval = null;

// Theme
function initTheme() {
  const saved = localStorage.getItem('voter_theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', saved);
  themeToggle.textContent = saved === 'light' ? '🌙' : '☀️';
}
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('voter_theme', next);
  themeToggle.textContent = next === 'light' ? '🌙' : '☀️';
});
initTheme();

// Connection indicator
if (connectionIndicatorContainer && typeof ConnectionIndicator === 'function') {
  connectionIndicatorContainer.appendChild(new ConnectionIndicator(socket));
}

// Initial state
if (!gameId) {
  window.location.href = '/';
} else {
  joinPrompt.style.display = 'flex';
  gameContent.style.display = 'none';
  const storedName = sessionStorage.getItem(`voter_${gameId}`) || urlName;
  if (storedName) {
    playerNameInput.value = storedName;
    joinAsSpectatorCheck.checked = urlSpectator;
    socket.emit('join-game', { gameId, playerName: storedName, asSpectator: urlSpectator });
  }
}

joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = playerNameInput.value.trim();
  if (!name && !joinAsSpectatorCheck.checked) return;
  socket.emit('join-game', {
    gameId,
    playerName: name || 'Spectateur',
    asSpectator: joinAsSpectatorCheck.checked,
  });
  sessionStorage.setItem(`voter_${gameId}`, name || 'Spectateur');
});

socket.on('game-joined', () => {
  joined = true;
  joinPrompt.style.display = 'none';
  gameContent.style.display = 'block';
});

socket.on('game-created', () => {
  joined = true;
  joinPrompt.style.display = 'none';
  gameContent.style.display = 'block';
});

socket.on('game-state', (game) => {
  currentGame = game;
  mySocketId = socket.id;
  renderGame(game);
});

socket.on('error', (data) => {
  if (typeof showToast === 'function') {
    showToast(data.message || 'Une erreur est survenue', 'error');
  } else {
    alert(data.message || 'Une erreur est survenue');
  }
  if (data.message && data.message.includes('introuvable')) {
    window.location.href = '/';
  }
});

function renderGame(game) {
  gameNameEl.textContent = game.name;
  gameUrlEl.value = window.location.href;

  const isSpectator = game.spectators?.some((s) => s.id === mySocketId);
  const isFacilitator = game.facilitatorSocketId === mySocketId;

  participantCount.textContent = game.participants.length;
  participantsList.innerHTML = game.participants
    .map((p) => {
      const voted = !game.revealed && game.votes[p.id];
      return `<li class="${p.isFacilitator ? 'facilitator' : ''} ${voted ? 'participant-voted' : ''}" data-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</li>`;
    })
    .join('');

  facilitatorSection.style.display = isFacilitator ? 'block' : 'none';

  issuesList.innerHTML = game.issues
    .map(
      (issue, i) =>
        `<li class="${i === game.currentIssueIndex ? 'active' : ''}" data-index="${i}" role="button" tabindex="0">${escapeHtml(issue.title)}${issue.estimate != null ? ` <span class="estimate-badge">${escapeHtml(String(issue.estimate))}</span>` : ''}</li>`
    )
    .join('');

  const currentIssue = game.issues[game.currentIssueIndex];
  if (currentIssue) {
    currentIssueTitle.textContent = currentIssue.title;
    currentIssueDesc.textContent = currentIssue.description || '';
    currentIssueDesc.style.display = currentIssue.description ? 'block' : 'none';
  } else {
    currentIssueTitle.textContent = 'Aucune issue';
    currentIssueDesc.textContent = '';
    currentIssueDesc.style.display = 'none';
  }

  const cards = game.cards || ['1', '2', '3', '5', '8', '13', '21', '?'];
  voteCards.innerHTML = cards
    .map(
      (v) =>
        `<button type="button" class="vote-card" data-value="${escapeHtml(v)}" aria-pressed="false">${escapeHtml(v)}</button>`
    )
    .join('');

  if (!isSpectator) {
    voteCards.style.display = 'flex';
    votingArea.querySelector('h3').textContent = 'Choisissez votre estimation';
    voteCards.querySelectorAll('.vote-card').forEach((card) => {
      const myVote = game.votes[mySocketId];
      const selected = myVote && String(myVote.value) === String(card.dataset.value);
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', selected);
    });
  } else {
    votingArea.querySelector('h3').textContent = 'Mode spectateur — vous ne pouvez pas voter';
    voteCards.style.display = 'none';
  }

  if (game.voteTimerEnd) {
    voteTimerEl.style.display = 'block';
    updateVoteTimer(game.voteTimerEnd);
    if (!voteTimerInterval) {
      voteTimerInterval = setInterval(() => updateVoteTimer(game.voteTimerEnd), 500);
    }
  } else {
    voteTimerEl.style.display = 'none';
    clearInterval(voteTimerInterval);
    voteTimerInterval = null;
  }

  const votes = Object.values(game.votes);
  if (game.revealed && votes.length > 0) {
    resultsArea.style.display = 'block';
    const byValue = {};
    votes.forEach((v) => {
      byValue[v.value] = byValue[v.value] || [];
      byValue[v.value].push(v.name);
    });
    resultsGrid.innerHTML = Object.entries(byValue)
      .sort((a, b) => {
        if (a[0] === '?' || a[0] === '☕') return 1;
        if (b[0] === '?' || b[0] === '☕') return -1;
        const na = Number(a[0]);
        const nb = Number(b[0]);
        return (isNaN(na) ? 0 : na) - (isNaN(nb) ? 0 : nb);
      })
      .map(
        ([val, names]) =>
          `<div class="result-item"><span class="result-value">${escapeHtml(val)}</span><span class="result-names">${names.map(escapeHtml).join(', ')}</span></div>`
      )
      .join('');
  } else {
    resultsArea.style.display = 'block';
    const votedCount = votes.length;
    const totalCount = game.participants.length;
    if (votedCount > 0) {
      resultsGrid.innerHTML = `<p class="waiting-text">${votedCount}/${totalCount} ont voté… Révélez les votes pour voir les résultats.</p>`;
    } else {
      resultsGrid.innerHTML = `<p class="waiting-text">En attente des votes.</p>`;
    }
  }

  revealBtn.style.display = isFacilitator ? 'inline-block' : 'none';
  resetBtn.style.display = isFacilitator ? 'inline-block' : 'none';
  prevIssueBtn.style.display = isFacilitator ? 'inline-block' : 'none';
  nextIssueBtn.style.display = isFacilitator ? 'inline-block' : 'none';
  startTimerBtn.style.display = isFacilitator ? 'inline-block' : 'none';
  timerSecondsInput.style.display = isFacilitator ? 'inline-block' : 'none';
  exportBtn.style.display = isFacilitator ? 'inline-block' : 'none';

  if (isFacilitator) {
    issuesList.querySelectorAll('li').forEach((li) => {
      li.addEventListener('click', () => {
        const idx = parseInt(li.dataset.index, 10);
        if (!isNaN(idx)) socket.emit('go-to-issue', { index: idx });
      });
    });
  }
}

function updateVoteTimer(endTime) {
  const left = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  voteTimerEl.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  voteTimerEl.classList.toggle('expired', left === 0);
}

voteCards.addEventListener('click', (e) => {
  const card = e.target.closest('.vote-card');
  if (!card) return;
  const value = card.dataset.value;
  socket.emit('vote', { value });
  if (typeof showToast === 'function') showToast('Vote enregistré', 'success');
});

copyUrlBtn.addEventListener('click', () => {
  gameUrlEl.select();
  navigator.clipboard?.writeText(gameUrlEl.value).then(() => {
    copyUrlBtn.textContent = 'Copié !';
    if (typeof showToast === 'function') showToast('URL copiée', 'success');
    setTimeout(() => (copyUrlBtn.textContent = 'Copier'), 1500);
  });
});

revealBtn.addEventListener('click', () => socket.emit('reveal-votes'));
resetBtn.addEventListener('click', () => socket.emit('reset-votes'));
prevIssueBtn.addEventListener('click', () => socket.emit('previous-issue'));
nextIssueBtn.addEventListener('click', () => socket.emit('next-issue'));

startTimerBtn.addEventListener('click', () => {
  const sec = parseInt(timerSecondsInput.value, 10) || 60;
  socket.emit('start-vote-timer', { seconds: sec });
});

exportBtn.addEventListener('click', () => {
  if (!currentGame) return;
  const rows = [
    ['Issue', 'Description', 'Estimation'],
    ...currentGame.issues.map((i) => [i.title, i.description || '', i.estimate != null ? i.estimate : '']),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `voter-${currentGame.name.replace(/\s+/g, '-')}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  if (typeof showToast === 'function') showToast('Export réussi', 'success');
});

addIssueBtn.addEventListener('click', () => {
  addIssueModal.style.display = 'flex';
  newIssueTitle.value = '';
  newIssueDesc.value = '';
  newIssueTitle.focus();
});

cancelAddIssue.addEventListener('click', () => {
  addIssueModal.style.display = 'none';
});

addIssueForm.addEventListener('submit', (e) => {
  e.preventDefault();
  socket.emit('add-issue', {
    title: newIssueTitle.value.trim(),
    description: newIssueDesc.value.trim(),
  });
  addIssueModal.style.display = 'none';
  if (typeof showToast === 'function') showToast('Issue ajoutée', 'success');
});

cancelEditIssue.addEventListener('click', () => {
  editIssueModal.style.display = 'none';
});

editIssueForm.addEventListener('submit', (e) => {
  e.preventDefault();
  socket.emit('edit-issue', {
    issueId: parseFloat(editIssueIdInput.value),
    title: editIssueTitleInput.value.trim(),
    description: editIssueDescInput.value.trim(),
  });
  editIssueModal.style.display = 'none';
  if (typeof showToast === 'function') showToast('Issue modifiée', 'success');
});

deleteIssueBtn.addEventListener('click', () => {
  if (confirm('Supprimer cette issue ?')) {
    socket.emit('delete-issue', { issueId: parseFloat(editIssueIdInput.value) });
    editIssueModal.style.display = 'none';
    if (typeof showToast === 'function') showToast('Issue supprimée', 'success');
  }
});

issuesList.addEventListener('dblclick', (e) => {
  const li = e.target.closest('li[data-index]');
  if (!li || !currentGame) return;
  const idx = parseInt(li.dataset.index, 10);
  const issue = currentGame.issues[idx];
  if (!issue || currentGame.facilitatorSocketId !== mySocketId) return;
  editIssueIdInput.value = issue.id;
  editIssueTitleInput.value = issue.title;
  editIssueDescInput.value = issue.description || '';
  editIssueModal.style.display = 'flex';
  editIssueTitleInput.focus();
});

document.addEventListener('keydown', (e) => {
  if (!currentGame || !joined) return;
  const isFacilitator = currentGame.facilitatorSocketId === mySocketId;
  if (e.key === 'Enter' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    if (isFacilitator && revealBtn.offsetParent) {
      revealBtn.click();
      e.preventDefault();
    }
  }
  if (e.key === 'ArrowLeft' && isFacilitator) prevIssueBtn.click();
  if (e.key === 'ArrowRight' && isFacilitator) nextIssueBtn.click();
});
