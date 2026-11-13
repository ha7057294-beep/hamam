import { openDB, requestStoragePersistence, getTodayTasks } from './db/indexedDB';
import { icons } from './utils/icons';
import { renderDashboardView } from './views/DashboardView';
import { renderCoopsView } from './views/CoopsView';
import { renderCoopDetailView } from './views/CoopDetailView';
import { renderPairsView } from './views/PairsView';
import { renderPairDetailView } from './views/PairDetailView';
import { renderEggsView } from './views/EggsView';
import { renderSquabDetailView } from './views/SquabDetailView';
import { renderBatchDetailView } from './views/BatchDetailView';
import { renderSettingsView } from './views/SettingsView';
import { renderInventoryView } from './views/InventoryView';
import { renderFinancesView } from './views/FinancesView';
import { renderReportsView } from './views/ReportsView';
import { showToast } from './components/Toast';
import { showQuickSearchModal } from './components/Modal';

// Service Worker Registration for PWA & Update Detection
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('PWA Service Worker registered:', reg.scope);

        // Check if there's an update waiting
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                const updateBanner = document.getElementById('pwa-update-banner');
                if (updateBanner) updateBanner.style.display = 'block';
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn('Service Worker registration skipped:', err);
      });
  });
}

// Capture BeforeInstallPromptEvent for in-app PWA install button (used in SettingsView)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).deferredPWAInstallPrompt = e;
  window.dispatchEvent(new Event('pwa-install-available'));
});

window.addEventListener('appinstalled', () => {
  (window as any).deferredPWAInstallPrompt = null;
  window.dispatchEvent(new Event('pwa-installed'));
  showToast('تم تثبيت تطبيق مزرعة الحمام بنجاح!', 'success');
});

// Main App Router and State
type ViewName =
  | 'dashboard'
  | 'coops'
  | 'coop_detail'
  | 'pairs'
  | 'pair_detail'
  | 'eggs'
  | 'squab_detail'
  | 'batch_detail'
  | 'inventory'
  | 'finances'
  | 'reports'
  | 'settings';

interface NavigationState {
  view: ViewName;
  params: Record<string, string>;
}

let currentState: NavigationState = {
  view: 'dashboard',
  params: {},
};

let isRenderingView = false;

export async function refreshAlertBadge(): Promise<void> {
  const fabBadge = document.getElementById('fab-alert-badge');
  const menuBadge = document.getElementById('menu-home-alert-badge');
  if (!fabBadge && !menuBadge) return;

  try {
    const tasks = await getTodayTasks();
    const count = tasks.length;
    const hasUrgent = tasks.some((t) => t.isUrgent);
    const label = count > 99 ? '99+' : String(count);

    [fabBadge, menuBadge].forEach((badgeEl) => {
      if (!badgeEl) return;
      if (count > 0) {
        badgeEl.textContent = label;
        badgeEl.classList.remove('is-hidden');
        badgeEl.classList.toggle('fab-badge-urgent', hasUrgent);
      } else {
        badgeEl.textContent = '0';
        badgeEl.classList.add('is-hidden');
        badgeEl.classList.remove('fab-badge-urgent');
      }
    });
  } catch (err) {
    console.warn('Failed to update alert badge:', err);
  }
}

(window as any).refreshAlertBadge = refreshAlertBadge;

let isFabMenuOpen = false;
let fabOpenScrollY = 0;

function updateMenuSelection() {
  const menuButtons = document.querySelectorAll('#fab-menu-popover .fab-menu-item');
  menuButtons.forEach((btn) => {
    const target = (btn as HTMLElement).dataset.target;
    const isActive =
      target === currentState.view ||
      (target === 'coops' &&
        (currentState.view === 'coop_detail' ||
          currentState.view === 'squab_detail' ||
          currentState.view === 'batch_detail' ||
          currentState.view === 'pairs' ||
          currentState.view === 'pair_detail'));
    btn.classList.toggle('active', isActive);
  });
}

function setFabMenuOpen(open: boolean) {
  isFabMenuOpen = open;
  const fabBtn = document.getElementById('fab-menu-btn');
  const fabIcon = fabBtn?.querySelector('.fab-icon');
  const popover = document.getElementById('fab-menu-popover');
  const backdrop = document.getElementById('fab-backdrop');
  const layer = document.getElementById('fab-layer');

  if (open) {
    fabOpenScrollY = window.scrollY;
    updateMenuSelection();
  }

  fabBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (fabIcon) {
    fabIcon.innerHTML = open ? icons.close : icons.menu;
  }
  popover?.classList.toggle('open', open);
  popover?.setAttribute('aria-hidden', open ? 'false' : 'true');
  backdrop?.classList.toggle('open', open);
  layer?.classList.toggle('is-open', open);
}

function isKeyboardInputFocused(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  if (active.isContentEditable) return true;
  if (active.tagName === 'TEXTAREA' || active.tagName === 'SELECT') return true;
  if (active.tagName === 'INPUT') {
    const type = ((active as HTMLInputElement).type || 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file'].includes(type);
  }
  return false;
}

function updateFabVisibility() {
  const layer = document.getElementById('fab-layer');
  if (!layer) return;

  const hasModal = document.querySelector('.modal-overlay') !== null;
  const hasInputFocus = isKeyboardInputFocused();
  const shouldHide = hasModal || hasInputFocus;

  if (shouldHide && isFabMenuOpen) {
    setFabMenuOpen(false);
  }
  layer.classList.toggle('fab-hidden', shouldHide);
}

async function navigate(view: string, params: Record<string, string> = {}) {
  setFabMenuOpen(false);
  currentState = {
    view: view as ViewName,
    params,
  };

  updateMenuSelection();
  await renderCurrentView();
  updateFabVisibility();
  await refreshAlertBadge();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function renderCurrentView() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  isRenderingView = true;
  mainContent.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px 20px;color:var(--text-secondary);gap:8px;">
      <span style="font-weight:700;">جاري التحميل...</span>
    </div>
  `;

  try {
    switch (currentState.view) {
      case 'dashboard':
        await renderDashboardView(mainContent, navigate);
        break;
      case 'coops':
        await renderCoopsView(mainContent, navigate);
        break;
      case 'coop_detail':
        await renderCoopDetailView(mainContent, currentState.params.coopId || '', navigate);
        break;
      case 'pairs':
        await renderPairsView(mainContent, navigate);
        break;
      case 'pair_detail':
        await renderPairDetailView(mainContent, currentState.params.pairId || '', navigate);
        break;
      case 'eggs':
        await renderEggsView(mainContent, navigate);
        break;
      case 'squab_detail':
        await renderSquabDetailView(mainContent, currentState.params.squabId || '', navigate);
        break;
      case 'batch_detail':
        await renderBatchDetailView(mainContent, currentState.params.batchId || '', navigate);
        break;
      case 'inventory':
        await renderInventoryView(mainContent);
        break;
      case 'finances':
        await renderFinancesView(mainContent);
        break;
      case 'reports':
        await renderReportsView(mainContent, navigate);
        break;
      case 'settings':
        await renderSettingsView(mainContent, navigate);
        break;
      default:
        await renderDashboardView(mainContent, navigate);
        break;
    }
  } catch (err: unknown) {
    console.error('Error rendering view:', err);
    mainContent.innerHTML = `
      <div class="card" style="border-color:var(--danger-border);background-color:var(--danger-bg);color:var(--danger);padding:20px;">
        <h3 style="font-weight:800;margin-bottom:8px;">حدث خطأ أثناء عرض الصفحة</h3>
        <p style="font-size:0.9rem;">${err instanceof Error ? err.message : String(err)}</p>
        <button class="btn btn-primary btn-sm" id="btn-reload-view" style="margin-top:12px;">إعادة المحاولة</button>
      </div>
    `;
    mainContent.querySelector('#btn-reload-view')?.addEventListener('click', () => {
      renderCurrentView();
    });
  } finally {
    isRenderingView = false;
    await refreshAlertBadge();
  }
}

// App Initialization
async function initApp() {
  const root = document.getElementById('app');
  if (!root) return;

  // Request Storage Persistence
  requestStoragePersistence().then((persisted) => {
    if (persisted) {
      console.log('IndexedDB storage persistence granted by browser.');
    }
  });

  // Build Shell
  root.innerHTML = `
    <!-- PWA Update Available Banner -->
    <div id="pwa-update-banner" style="display:none;background-color:#059669;color:#FFFFFF;padding:8px 14px;font-size:0.86rem;text-align:center;font-weight:700;">
      <span>يوجد إصدار محدّث متوفر للتطبيق!</span>
      <button id="btn-reload-pwa" style="margin-right:10px;background-color:#FFFFFF;color:#065F46;border:none;border-radius:6px;padding:3px 10px;font-weight:800;font-size:0.86rem;cursor:pointer;">
        تحديث الآن
      </button>
    </div>

    <!-- Offline status notification (shown automatically when offline) -->
    <div id="offline-banner" style="display:none;background-color:#92400E;color:#FFFFFF;padding:6px 12px;font-size:0.86rem;text-align:center;font-weight:700;">
      أنت تعمل بدون اتصال بالإنترنت • جميع البيانات تُحفظ محلياً في جهازك (IndexedDB)
    </div>

    <!-- Compact App Header (App Name + Search) -->
    <header class="app-header">
      <div class="header-brand" id="brand-click">
        <div class="header-icon">
          ${icons.pigeon}
        </div>
        <div class="header-title-wrap">
          <h1>مزرعة الحمام</h1>
        </div>
      </div>

      <div class="header-actions">
        <button class="btn btn-outline btn-icon-only" id="header-search-btn" title="بحث سريع (سلاكة، زوج، زغلول، دفعة)">
          ${icons.search}
        </button>
      </div>
    </header>

    <!-- Main Dynamic Content Container -->
    <main id="main-content" class="main-content"></main>

    <!-- Floating Menu Backdrop -->
    <div id="fab-backdrop" class="fab-backdrop"></div>

    <!-- Floating Action Button & Navigation Popover -->
    <div id="fab-layer" class="fab-layer">
      <nav id="fab-menu-popover" class="fab-menu-popover" role="menu" aria-hidden="true" aria-label="قائمة الشاشات">
        <button type="button" class="fab-menu-item active" role="menuitem" data-target="dashboard">
          <span class="fab-menu-item-main">
            <span class="fab-menu-item-icon">${icons.home}</span>
            <span class="fab-menu-item-label">الرئيسية</span>
          </span>
          <span id="menu-home-alert-badge" class="fab-menu-badge is-hidden">0</span>
        </button>

        <button type="button" class="fab-menu-item" role="menuitem" data-target="coops">
          <span class="fab-menu-item-main">
            <span class="fab-menu-item-icon">${icons.coop}</span>
            <span class="fab-menu-item-label">السلاكات</span>
          </span>
        </button>

        <button type="button" class="fab-menu-item" role="menuitem" data-target="inventory">
          <span class="fab-menu-item-main">
            <span class="fab-menu-item-icon">${icons.grain}</span>
            <span class="fab-menu-item-label">المخزون والعلف</span>
          </span>
        </button>

        <button type="button" class="fab-menu-item" role="menuitem" data-target="finances">
          <span class="fab-menu-item-main">
            <span class="fab-menu-item-icon">${icons.wallet}</span>
            <span class="fab-menu-item-label">المالية</span>
          </span>
        </button>

        <button type="button" class="fab-menu-item" role="menuitem" data-target="reports">
          <span class="fab-menu-item-main">
            <span class="fab-menu-item-icon">${icons.stats || '📊'}</span>
            <span class="fab-menu-item-label">التقارير</span>
          </span>
        </button>

        <button type="button" class="fab-menu-item" role="menuitem" data-target="settings">
          <span class="fab-menu-item-main">
            <span class="fab-menu-item-icon">${icons.settings}</span>
            <span class="fab-menu-item-label">الإعدادات</span>
          </span>
        </button>
      </nav>

      <button
        type="button"
        id="fab-menu-btn"
        class="fab-button"
        aria-label="القائمة"
        aria-expanded="false"
        aria-haspopup="menu"
      >
        <span class="fab-icon">${icons.menu}</span>
        <span id="fab-alert-badge" class="fab-badge is-hidden">0</span>
      </button>
    </div>
  `;

  // Reload PWA button handler
  document.getElementById('btn-reload-pwa')?.addEventListener('click', () => {
    window.location.reload();
  });

  // Offline status listener
  const offlineBanner = document.getElementById('offline-banner');
  const updateOnlineStatus = () => {
    if (offlineBanner) {
      offlineBanner.style.display = navigator.onLine ? 'none' : 'block';
    }
  };
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // Floating menu handlers
  document.getElementById('fab-menu-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setFabMenuOpen(!isFabMenuOpen);
  });

  document.getElementById('fab-backdrop')?.addEventListener('click', () => {
    setFabMenuOpen(false);
  });

  document.querySelectorAll('#fab-menu-popover .fab-menu-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = (btn as HTMLElement).dataset.target;
      setFabMenuOpen(false);
      if (target) navigate(target);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFabMenuOpen) {
      setFabMenuOpen(false);
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      if (isFabMenuOpen && Math.abs(window.scrollY - fabOpenScrollY) > 60) {
        setFabMenuOpen(false);
      }
    },
    { passive: true }
  );

  // Auto-hide FAB when modals open or editable input has focus
  const modalObserver = new MutationObserver(() => {
    updateFabVisibility();
  });
  modalObserver.observe(document.body, { childList: true });

  document.addEventListener('focusin', () => {
    updateFabVisibility();
  });

  document.addEventListener('focusout', () => {
    window.setTimeout(updateFabVisibility, 60);
  });

  document.getElementById('brand-click')?.addEventListener('click', () => navigate('dashboard'));
  document.getElementById('header-search-btn')?.addEventListener('click', () => showQuickSearchModal(navigate));

  // Keep alert count badge updated across all screens whenever views re-render or data changes
  window.addEventListener('farm-data-updated', () => {
    refreshAlertBadge();
  });

  const mainContentEl = document.getElementById('main-content');
  if (mainContentEl) {
    let badgeTimer: number | undefined;
    const observer = new MutationObserver(() => {
      if (isRenderingView) return;
      window.clearTimeout(badgeTimer);
      badgeTimer = window.setTimeout(() => {
        refreshAlertBadge();
      }, 120);
    });
    observer.observe(mainContentEl, { childList: true });
  }

  // Recalculate alerts when returning to the app
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshAlertBadge();
      if (currentState.view === 'dashboard') {
        renderCurrentView();
      }
    }
  });

  // Render initial view and alert badge
  await renderCurrentView();
  await refreshAlertBadge();
}

document.addEventListener('DOMContentLoaded', initApp);
