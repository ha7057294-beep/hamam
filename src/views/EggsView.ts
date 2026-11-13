import { getEggs, getPairs, getCoops, getSettings } from '../db/indexedDB';
import { Egg, Pair, Coop, FarmSettings } from '../types';
import { getEggSchedule, formatDateArabic } from '../utils/dateUtils';
import { icons } from '../utils/icons';
import {
  showLayEggModal,
  showEditEggLaidDateModal,
  showDeleteEggModal,
  showEggFertilityCheckModal,
  showEggBrokenOrLostModal,
  showEventHistoryModal,
  showRecordHatchModal,
} from '../components/Modal';

function getEggBadgeClass(status: Egg['status']): string {
  switch (status) {
    case 'pending':
      return 'badge-warning';
    case 'fertile':
      return 'badge-success';
    case 'hatched':
      return 'badge-squab';
    case 'infertile':
      return 'badge-muted';
    case 'broken':
    case 'lost':
      return 'badge-danger';
    default:
      return 'badge-muted';
  }
}

function openEggActionsModal(
  egg: Egg,
  pair: Pair | undefined,
  coop: Coop | undefined,
  settings: FarmSettings,
  onSuccess: () => void,
  navigate: (view: string, params?: Record<string, string>) => void
) {
  const schedule = getEggSchedule(egg, settings);
  const badgeClass = getEggBadgeClass(egg.status);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const closeOverlay = () => {
    overlay.remove();
    document.body.style.overflow = '';
  };

  document.body.style.overflow = 'hidden';

  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">
          <span class="modal-title-icon">${icons.egg}</span>
          <span>بيضة ${egg.eggNumber}</span>
        </div>
        <button type="button" class="btn btn-outline btn-icon-only" id="btn-close-egg-sheet" aria-label="إغلاق">
          ${icons.close}
        </button>
      </div>

      <div class="modal-body">
        <div class="egg-detail-summary">
          <div class="egg-detail-meta-row">
            <span>الحالة:</span>
            <span class="badge ${badgeClass}">${schedule.statusText}</span>
          </div>
          <div class="egg-detail-meta-row">
            <span>الزوج / السلاكة:</span>
            <strong>${pair ? pair.name : '—'}${coop ? ` · سلاكة ${coop.number}` : ''}</strong>
          </div>
          <div class="egg-detail-meta-row">
            <span>تاريخ الوضع:</span>
            <strong>${formatDateArabic(egg.laidDate)} (منذ ${schedule.daysSinceLaid} يوم)</strong>
          </div>
          <div class="egg-detail-countdown ${schedule.isCheckDue ? 'egg-detail-countdown-due' : ''}">
            ${schedule.countdownText}
          </div>
        </div>

        <div class="egg-detail-actions">
          ${
            egg.status === 'pending' || egg.status === 'fertile'
              ? `<button type="button" class="btn btn-success btn-sm" id="sheet-action-hatch">
                  ${icons.squab} تسجيل فقس
                </button>`
              : ''
          }
          ${
            egg.status === 'pending'
              ? `<button type="button" class="btn btn-primary btn-sm" id="sheet-action-check">
                  ${icons.check} فحص التخصيب
                </button>`
              : ''
          }
          ${
            egg.status === 'fertile'
              ? `<button type="button" class="btn btn-outline btn-sm" id="sheet-action-check">
                  ${icons.edit} إعادة فحص التخصيب
                </button>`
              : ''
          }
          ${
            egg.status === 'pending' || egg.status === 'fertile'
              ? `<button type="button" class="btn btn-danger btn-sm" id="sheet-action-broken">
                  ${icons.eggCrack} تسجيل كسر أو فقدان
                </button>`
              : ''
          }
          <button type="button" class="btn btn-outline btn-sm" id="sheet-action-edit-date">
            ${icons.calendar} تعديل تاريخ الوضع
          </button>
          ${
            egg.status !== 'hatched'
              ? `<button type="button" class="btn btn-danger btn-sm" id="sheet-action-delete">
                  ${icons.trash} حذف (اتسجلت بالغلط)
                </button>`
              : ''
          }
          <button type="button" class="btn btn-outline btn-sm" id="sheet-action-history">
            ${icons.history} سجل أحداث البيضة
          </button>
        </div>

        ${
          coop || pair
            ? `
          <div class="egg-detail-links">
            ${
              coop
                ? `<button type="button" class="btn btn-secondary btn-sm" id="sheet-goto-coop">فتح السلاكة</button>`
                : ''
            }
            ${
              pair
                ? `<button type="button" class="btn btn-secondary btn-sm" id="sheet-goto-pair">فتح الزوج</button>`
                : ''
            }
          </div>
        `
            : ''
        }
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline btn-sm" id="btn-footer-close-egg">إغلاق</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });
  overlay.querySelector('#btn-close-egg-sheet')?.addEventListener('click', closeOverlay);
  overlay.querySelector('#btn-footer-close-egg')?.addEventListener('click', closeOverlay);

  const pairName = pair ? pair.name : '—';
  const coopNumber = coop ? coop.number : '—';

  overlay.querySelector('#sheet-action-hatch')?.addEventListener('click', () => {
    closeOverlay();
    showRecordHatchModal(egg, pairName, coopNumber, onSuccess);
  });

  overlay.querySelector('#sheet-action-check')?.addEventListener('click', () => {
    closeOverlay();
    showEggFertilityCheckModal(egg, pairName, coopNumber, onSuccess);
  });

  overlay.querySelector('#sheet-action-broken')?.addEventListener('click', () => {
    closeOverlay();
    showEggBrokenOrLostModal(egg, pairName, coopNumber, onSuccess);
  });

  overlay.querySelector('#sheet-action-edit-date')?.addEventListener('click', () => {
    closeOverlay();
    showEditEggLaidDateModal(egg, pairName, coopNumber, onSuccess);
  });

  overlay.querySelector('#sheet-action-delete')?.addEventListener('click', () => {
    closeOverlay();
    showDeleteEggModal(egg, pairName, coopNumber, onSuccess);
  });

  overlay.querySelector('#sheet-action-history')?.addEventListener('click', () => {
    closeOverlay();
    showEventHistoryModal(`البيضة رقم ${egg.eggNumber} (${formatDateArabic(egg.laidDate)})`, egg.id);
  });

  overlay.querySelector('#sheet-goto-coop')?.addEventListener('click', () => {
    closeOverlay();
    if (coop) navigate('coop_detail', { coopId: coop.id });
  });

  overlay.querySelector('#sheet-goto-pair')?.addEventListener('click', () => {
    closeOverlay();
    if (pair) navigate('pair_detail', { pairId: pair.id });
  });
}

export async function renderEggsView(
  container: HTMLElement,
  navigate: (view: string, params?: Record<string, string>) => void
) {
  const [eggs, pairs, coops, settings] = await Promise.all([
    getEggs(),
    getPairs(),
    getCoops(),
    getSettings(),
  ]);

  let currentFilter = 'active';

  function filterEggs(filter: string): Egg[] {
    switch (filter) {
      case 'active':
        return eggs.filter((e) => e.status === 'pending' || e.status === 'fertile');
      case 'pending':
        return eggs.filter((e) => e.status === 'pending');
      case 'fertile':
        return eggs.filter((e) => e.status === 'fertile');
      case 'hatched':
        return eggs.filter((e) => e.status === 'hatched');
      case 'infertile':
        return eggs.filter((e) => e.status === 'infertile');
      case 'broken_lost':
        return eggs.filter((e) => e.status === 'broken' || e.status === 'lost');
      default:
        return eggs;
    }
  }

  function renderList() {
    const listContainer = container.querySelector('#eggs-list-container');
    if (!listContainer) return;

    const filtered = filterEggs(currentFilter);

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="compact-empty-state">
          <div class="compact-empty-title">لا يوجد بيض في هذا التصنيف</div>
          <div class="compact-empty-desc">
            ${eggs.length === 0 ? 'ابدأ بتسجيل أول بيضة وضعت في المزرعة.' : 'لا يوجد بيض يطابق هذا الفلتر.'}
          </div>
          <button type="button" class="btn btn-primary btn-sm compact-empty-btn" id="btn-lay-egg-empty">
            ${icons.plus} تسجيل بيض
          </button>
        </div>
      `;
      listContainer.querySelector('#btn-lay-egg-empty')?.addEventListener('click', () => {
        showLayEggModal(null, null, () => renderEggsView(container, navigate));
      });
      return;
    }

    listContainer.innerHTML = `
      <div class="compact-list">
        ${filtered
          .map((egg) => {
            const pair = pairs.find((p) => p.id === egg.pairId);
            const coop = coops.find((c) => c.id === egg.coopId);
            const schedule = getEggSchedule(egg, settings);
            const badgeClass = getEggBadgeClass(egg.status);

            const line1Parts = [`بيضة ${egg.eggNumber}`];
            if (pair) line1Parts.push(pair.name);
            if (coop) line1Parts.push(`سلاكة ${coop.number}`);

            return `
              <div class="list-card egg-card" data-egg-id="${egg.id}">
                <div class="list-card-main">
                  <div class="list-card-lines">
                    <div class="list-card-line1">${line1Parts.join(' · ')}</div>
                    <div class="list-card-line2">${schedule.countdownText}</div>
                  </div>
                </div>
                <div class="list-card-badge-wrap">
                  <span class="badge ${badgeClass}">${schedule.statusText}</span>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;

    listContainer.querySelectorAll('.egg-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = (card as HTMLElement).dataset.eggId;
        const targetEgg = eggs.find((e) => e.id === id);
        if (!targetEgg) return;

        const pair = pairs.find((p) => p.id === targetEgg.pairId);
        const coop = coops.find((c) => c.id === targetEgg.coopId);
        openEggActionsModal(
          targetEgg,
          pair,
          coop,
          settings,
          () => renderEggsView(container, navigate),
          navigate
        );
      });
    });
  }

  container.innerHTML = `
    <div class="list-view-header">
      <h1 class="list-view-title">سجل البيض (${eggs.length})</h1>
      <button type="button" class="btn btn-primary btn-sm list-add-btn" id="btn-lay-egg-top">
        ${icons.plus} تسجيل
      </button>
    </div>

    <div class="filter-tabs">
      <button type="button" class="filter-tab active" data-filter="active">بالحضانة</button>
      <button type="button" class="filter-tab" data-filter="pending">بانتظار الفحص</button>
      <button type="button" class="filter-tab" data-filter="fertile">مخصبة</button>
      <button type="button" class="filter-tab" data-filter="hatched">فقست</button>
      <button type="button" class="filter-tab" data-filter="infertile">رايقة</button>
      <button type="button" class="filter-tab" data-filter="broken_lost">مكسورة/مفقودة</button>
      <button type="button" class="filter-tab" data-filter="all">الكل</button>
    </div>

    <div id="eggs-list-container"></div>
  `;

  renderList();

  container.querySelector('#btn-lay-egg-top')?.addEventListener('click', () => {
    showLayEggModal(null, null, () => renderEggsView(container, navigate));
  });

  container.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = (tab as HTMLElement).dataset.filter || 'active';
      renderList();
    });
  });
}
