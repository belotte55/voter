(function () {
  'use strict';

  // Toast notifications
  const toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastContainer);

  window.showToast = function (message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  // Connection indicator
  window.ConnectionIndicator = function (socket) {
    const el = document.createElement('div');
    el.className = 'connection-indicator';
    el.setAttribute('aria-label', 'État de la connexion');
    const dot = document.createElement('span');
    dot.className = 'connection-dot';
    el.appendChild(dot);
    const text = document.createElement('span');
    text.className = 'connection-text';
    el.appendChild(text);

    function update(status) {
      el.className = 'connection-indicator connection-' + status;
      dot.setAttribute('aria-hidden', 'true');
      text.textContent = status === 'connected' ? 'Connecté' : status === 'reconnecting' ? 'Reconnexion…' : 'Déconnecté';
    }

    socket.on('connect', () => update('connected'));
    socket.on('disconnect', () => update('disconnected'));
    socket.on('reconnect_attempt', () => update('reconnecting'));
    socket.on('reconnect', () => update('connected'));

    return el;
  };

  // Escape HTML
  window.escapeHtml = function (text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };
})();
