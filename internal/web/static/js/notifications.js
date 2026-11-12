/**
 * SVG Animator Studio — Studio Notification Presentation System (`notifications.js`)
 *
 * Responsibilities:
 *   - Non-blocking toast notifications (info, success, warning, error)
 *   - Accessible polite live-region announcements
 *   - Auto-dismiss timeouts with smooth fade-out animations
 *   - Idempotent subscription to AppCoordinator 'notification:show' events
 *
 * Layer 1 (UI Presentation).
 */

(function() {
  'use strict';

  window.StudioNotification = {
    _subscriptionAttached: false,

    show(message, type = 'info', durationMs = 3500) {
      if (typeof document === 'undefined' || !document.createElement) {
        if (typeof console !== 'undefined') console.log(`[StudioNotification:${type}] ${message}`);
        return null;
      }
      let container = document.getElementById('studioNotificationContainer');
      if (!container) {
        container = document.createElement('div');
        container.id = 'studioNotificationContainer';
        container.className = 'studio-notification-container';
        container.setAttribute('aria-live', 'polite');
        if (document.body) document.body.appendChild(container);
      }

      const toast = document.createElement('div');
      toast.className = 'studio-notification notice-' + type;

      const icons = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌'
      };
      const iconSpan = document.createElement('span');
      iconSpan.textContent = icons[type] || 'ℹ️';

      const textSpan = document.createElement('span');
      textSpan.style.flex = '1';
      textSpan.textContent = message;

      const closeBtn = document.createElement('button');
      closeBtn.className = 'studio-notification-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.onclick = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        setTimeout(() => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 250);
      };

      toast.appendChild(iconSpan);
      toast.appendChild(textSpan);
      toast.appendChild(closeBtn);
      if (container) container.appendChild(toast);

      if (durationMs > 0) {
        setTimeout(() => {
          if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(6px)';
            setTimeout(() => {
              if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 250);
          }
        }, durationMs);
      }
      return toast;
    },

    bindCoordinator() {
      if (this._subscriptionAttached) return;
      if (typeof window !== 'undefined' && window.AppCoordinator && typeof window.AppCoordinator.on === 'function') {
        this._subscriptionAttached = true;
        window.AppCoordinator.on('notification:show', (ev) => {
          if (ev && window.StudioNotification) {
            window.StudioNotification.show(ev.message, ev.type, ev.durationMs);
          }
        });
      }
    }
  };

  window.StudioNotification.bindCoordinator();
})();
