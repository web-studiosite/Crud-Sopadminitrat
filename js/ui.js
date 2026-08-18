/* ============================================================
 * OFFICIAL SHOP ADMINISTRATION — js/ui.js
 *
 * Utilitários de interface:
 *   UI.showToast(type, message, timeoutMs)  → success | error | warning | info
 *   UI.openModal(id) / UI.closeModal(id)
 *   UI.confirmDialog(options)               → Promise<boolean>
 *   UI.escapeHtml(value)
 *   UI.formatMZN(value)
 *   UI.setButtonLoading(button, loading)
 *
 * REGRA: toast "success" só deve ser chamado DEPOIS da
 * confirmação real da operação no Supabase.
 * ============================================================ */

const UI = (() => {
  'use strict';

  /* ---------- toasts ---------- */

  function ensureToastContainer() {
    let c = document.getElementById('toastContainer');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toastContainer';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  const TOAST_ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

  function showToast(type, message, timeoutMs) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + (TOAST_ICONS[type] ? type : 'info');
    toast.innerHTML =
      '<span class="toast-icon">' + (TOAST_ICONS[type] || TOAST_ICONS.info) + '</span>' +
      '<span class="toast-message"></span>' +
      '<button class="toast-close" type="button" aria-label="Fechar">×</button>';
    toast.querySelector('.toast-message').textContent = message;
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, timeoutMs || 5000);
  }

  /* ---------- modais ---------- */

  function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('is-open');
  }

  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('is-open');
  }

  /** Diálogo de confirmação real. Resolve true só se o utilizador confirmar. */
  function confirmDialog(options) {
    options = options || {};
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay is-open';
      overlay.innerHTML =
        '<div class="modal modal-sm" role="dialog" aria-modal="true">' +
          '<div class="modal-header"><h3 class="modal-title"></h3></div>' +
          '<div class="modal-body"><p class="confirm-message"></p></div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-ghost" data-act="cancel">Cancelar</button>' +
            '<button type="button" class="btn" data-act="ok"></button>' +
          '</div>' +
        '</div>';
      overlay.querySelector('.modal-title').textContent = options.title || 'Confirmar';
      overlay.querySelector('.confirm-message').textContent = options.message || 'Tem a certeza?';
      const okBtn = overlay.querySelector('[data-act="ok"]');
      okBtn.textContent = options.confirmText || 'Confirmar';
      okBtn.classList.add(options.danger ? 'btn-danger' : 'btn-primary');

      function done(value) {
        overlay.remove();
        resolve(value);
      }
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => done(false));
      okBtn.addEventListener('click', () => done(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
      document.body.appendChild(overlay);
      okBtn.focus();
    });
  }

  /* ---------- helpers ---------- */

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Formatação monetária em Metical moçambicano (MZN). Nunca inventa valores. */
  function formatMZN(value) {
    const n = Number(value);
    if (isNaN(n)) return '—';
    try {
      return n.toLocaleString(CONFIG.app.locale, { style: 'currency', currency: CONFIG.app.currency });
    } catch (e) {
      return n.toFixed(2) + ' MZN';
    }
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(CONFIG.app.locale);
    } catch (e) {
      return iso;
    }
  }

  function setButtonLoading(button, loading, loadingLabel) {
    if (!button) return;
    if (loading) {
      button.dataset.originalLabel = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span> ' + (loadingLabel || 'A processar…');
    } else {
      button.disabled = false;
      if (button.dataset.originalLabel) button.innerHTML = button.dataset.originalLabel;
    }
  }

  /* ---------- paginação ---------- */

  function renderPagination(container, page, pageSize, total, onPage) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    container.innerHTML = '';

    const info = document.createElement('span');
    info.className = 'pager-info';
    info.textContent = total + ' registo(s) · página ' + page + ' de ' + totalPages;
    container.appendChild(info);

    function pageBtn(label, target, disabled, active) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pager-btn' + (active ? ' is-active' : '');
      b.textContent = label;
      b.disabled = !!disabled;
      b.addEventListener('click', () => onPage(target));
      container.appendChild(b);
    }

    pageBtn('‹', page - 1, page <= 1, false);
    const windowSize = 5;
    let start = Math.max(1, page - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    for (let p = start; p <= end; p++) pageBtn(String(p), p, false, p === page);
    pageBtn('›', page + 1, page >= totalPages, false);
  }

  return {
    showToast,
    openModal,
    closeModal,
    confirmDialog,
    escapeHtml,
    formatMZN,
    formatDateTime,
    setButtonLoading,
    renderPagination
  };
})();
