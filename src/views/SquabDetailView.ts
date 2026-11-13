import {
  getSquab,
  getCoop,
  getPair,
  getEgg,
  getEventsForEntity,
  getSettings,
  getBatch,
  getSaleItemForSquab,
  getSale,
} from '../db/indexedDB';
import {
  formatDateArabic,
  formatDateTimeArabic,
  getSquabAge,
  formatAgeArabic,
  isSquabReadyForSale,
} from '../utils/dateUtils';
import { icons } from '../utils/icons';
import {
  showRecordSquabDeathModal,
  showAddSquabWeightModal,
  showEditSquabModal,
  showPostponeSaleModal,
  showRecordSaleModal,
} from '../components/Modal';

type SquabTab = 'summary' | 'weights' | 'history';

let lastSquabId = '';
let activeSquabTab: SquabTab = 'summary';

export async function renderSquabDetailView(
  container: HTMLElement,
  squabId: string,
  navigate: (view: string, params?: Record<string, string>) => void
) {
  const [squab, events, settings] = await Promise.all([
    getSquab(squabId),
    getEventsForEntity(squabId),
    getSettings(),
  ]);

  if (!squab) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">سجل الزغلول غير موجود</div>
        <button class="btn btn-primary" id="btn-back-coops">${icons.back} العودة للسلاكات</button>
      </div>
    `;
    container.querySelector('#btn-back-coops')?.addEventListener('click', () => navigate('coops'));
    return;
  }

  if (squabId !== lastSquabId) {
    lastSquabId = squabId;
    activeSquabTab = 'summary';
  }

  const [originCoop, currentCoop, pair, egg, batch] = await Promise.all([
    getCoop(squab.originCoopId),
    squab.currentLocationId && squab.currentLocationId !== squab.originCoopId
      ? getCoop(squab.currentLocationId)
      : null,
    getPair(squab.pairId),
    getEgg(squab.eggId),
    squab.batchId ? getBatch(squab.batchId) : null,
  ]);

  // If sold, fetch sale details
  let saleItem = null;
  let sale = null;
  if (squab.status === 'sold') {
    saleItem = await getSaleItemForSquab(squab.id);
    if (saleItem) {
      sale = await getSale(saleItem.saleId);
    }
  }

  const currentAge = getSquabAge(squab.hatchDate, squab.deathDate);
  const isReadyForTransfer =
    squab.status === 'alive_production' && currentAge >= (settings.weaningAgeDays || 20);
  const isReadyForSaleNow =
    (squab.status === 'alive_production' || squab.status === 'transferred_collection') &&
    isSquabReadyForSale(squab);

  const isAlive =
    squab.status === 'alive_production' || squab.status === 'transferred_collection';

  let statusBadgeClass = 'badge-success';
  let statusLabel = 'حي في الإنتاج';
  let heroIconClass = 'detail-hero-icon-success';
  let heroIcon = icons.squab;

  if (squab.status === 'transferred_collection') {
    statusBadgeClass = 'badge-primary';
    statusLabel = 'منقول للتجميع';
    heroIconClass = 'detail-hero-icon-info';
    heroIcon = icons.box;
  } else if (squab.status === 'sold') {
    statusBadgeClass = 'badge-warning';
    statusLabel = 'مباع';
    heroIconClass = 'detail-hero-icon-warning';
    heroIcon = icons.cash;
  } else if (squab.status === 'deceased') {
    statusBadgeClass = 'badge-danger';
    statusLabel = 'نافق';
    heroIconClass = 'detail-hero-icon-danger';
    heroIcon = icons.skull;
  }

  const weights = squab.weights || [];

  const renderSummaryTab = () => `
    <div class="card">
      <!-- Top 3-4 key facts (Origin, Hatch, Current/Sale/Death, Health) -->
      <div class="detail-info-grid">
        <div class="detail-info-box">
          <span class="detail-info-label">السلاكة الأصلية</span>
          <strong class="detail-info-value">${originCoop ? `سلاكة ${originCoop.number}` : '—'}</strong>
          ${
            originCoop
              ? `<button class="btn btn-outline btn-sm" id="btn-goto-coop">فتح السلاكة ←</button>`
              : ''
          }
        </div>

        <div class="detail-info-box">
          <span class="detail-info-label">الزوج الأصلي</span>
          <strong class="detail-info-value">${pair ? pair.name : '—'}</strong>
          ${
            pair
              ? `<button class="btn btn-outline btn-sm" id="btn-goto-pair">صفحة الزوج ←</button>`
              : ''
          }
        </div>
      </div>

      <div class="detail-info-box">
        <div class="detail-info-row">
          <span class="detail-info-label">تاريخ الفقس:</span>
          <strong class="detail-info-value">${formatDateArabic(squab.hatchDate)}</strong>
        </div>
        ${
          egg
            ? `<div class="detail-info-row">
                <span class="detail-info-label">البيضة المصدر:</span>
                <span>البيضة رقم ${egg.eggNumber} (${formatDateArabic(egg.laidDate)})</span>
              </div>`
            : ''
        }
      </div>

      ${
        batch || currentCoop
          ? `
        <div class="detail-alert-box detail-alert-box-info">
          <div class="detail-info-row">
            <strong class="detail-inline-group">${icons.box} بيانات التجميع والدفعة</strong>
            ${
              batch
                ? `<button class="btn btn-sm btn-secondary" id="btn-goto-batch">فتح ${batch.batchNumber} ←</button>`
                : ''
            }
          </div>
          <div class="detail-info-grid">
            <div>المكان: <strong>${currentCoop ? `تجميع ${currentCoop.number}` : originCoop ? `سلاكة ${originCoop.number}` : '—'}</strong></div>
            <div>تاريخ النقل: <strong>${formatDateArabic(squab.transferDate || '')}</strong></div>
            <div>العمر عند النقل: <strong>${squab.ageAtTransfer !== undefined ? `${squab.ageAtTransfer} يوم` : '—'}</strong></div>
            <div>موعد البيع: <strong>${formatDateArabic(squab.targetSaleDate || '')}</strong></div>
          </div>
          ${
            squab.postponedUntil
              ? `<div class="detail-alert-box detail-alert-box-warning">
                  <div>تأجيل البيع حتى: <strong>${formatDateArabic(squab.postponedUntil)}</strong></div>
                  ${squab.postponeReason ? `<div>السبب: ${squab.postponeReason}</div>` : ''}
                </div>`
              : ''
          }
        </div>
      `
          : ''
      }

      ${
        squab.status === 'sold' && saleItem
          ? `
        <div class="detail-alert-box detail-alert-box-warning">
          <strong class="detail-inline-group">${icons.cash} بيانات عملية البيع</strong>
          <div class="detail-info-grid">
            <div>سعر البيع: <strong>${saleItem.price} ج.م</strong></div>
            <div>تاريخ البيع: <strong>${sale ? formatDateArabic(sale.date) : '—'}</strong></div>
            ${sale?.buyer ? `<div class="detail-info-box-full">المشتري: <strong>${sale.buyer}</strong></div>` : ''}
            ${sale?.note ? `<div class="detail-info-box-full">ملاحظات: ${sale.note}</div>` : ''}
          </div>
        </div>
      `
          : ''
      }

      ${
        squab.status === 'deceased'
          ? `
        <div class="detail-alert-box detail-alert-box-danger">
          <strong class="detail-inline-group">${icons.skull} بيانات النفوق</strong>
          <div>تاريخ النفوق: <strong>${formatDateArabic(squab.deathDate || '')}</strong> (عمر ${currentAge} يوم)</div>
          ${squab.deathReason ? `<div>السبب: <strong>${squab.deathReason}</strong></div>` : ''}
        </div>
      `
          : ''
      }

      <!-- Health & Notes -->
      <div class="detail-alert-box ${squab.illnessOrInjury ? 'detail-alert-box-warning' : 'detail-alert-box-success'}">
        <strong>الحالة الصحية:</strong>
        <span>${squab.illnessOrInjury ? squab.illnessOrInjury : 'سليم ولا توجد إصابات أو أمراض مسجلة'}</span>
      </div>

      ${
        squab.notes
          ? `<div class="detail-note-box"><strong>ملاحظات:</strong> ${squab.notes}</div>`
          : ''
      }

      <!-- Unified Action Row: 1 prominent primary CTA + compact secondary actions -->
      ${
        isAlive
          ? `
        <div class="detail-action-bar">
          <button class="btn btn-primary btn-sm btn-primary-main" id="btn-sell-squab">
            ${icons.cash} تسجيل بيع
          </button>
          <button class="btn btn-outline btn-sm detail-btn-warning-outline" id="btn-postpone-sale">
            ${icons.clock} تأجيل البيع
          </button>
          <button class="btn btn-danger btn-sm" id="btn-record-death">
            ${icons.skull} نفوق
          </button>
        </div>
      `
          : ''
      }
    </div>
  `;

  const renderWeightsTab = () => `
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.scale} سجل الأوزان (${weights.length})
        </div>
        ${
          isAlive
            ? `<button class="btn btn-sm btn-primary" id="btn-add-weight">
                ${icons.plus} تسجيل وزن
              </button>`
            : ''
        }
      </div>

      ${
        weights.length === 0
          ? `
        <div class="detail-empty-box">
          لم يتم تسجيل أي وزن لهذا الزغلول بعد.
        </div>
      `
          : `
        <div class="detail-section-list">
          ${weights
            .map((wt, idx) => {
              const prevWt = idx > 0 ? weights[idx - 1] : null;
              const delta = prevWt ? wt.weightGrams - prevWt.weightGrams : null;

              return `
              <div class="detail-weight-row">
                <div class="detail-inline-group">
                  <span class="detail-weight-value">${wt.weightGrams} جم</span>
                  ${
                    delta !== null
                      ? `<span class="badge ${delta >= 0 ? 'badge-success' : 'badge-danger'}">
                          ${delta >= 0 ? '+' : ''}${delta} جم
                        </span>`
                      : '<span class="badge badge-muted">أول وزن</span>'
                  }
                </div>
                <div class="detail-weight-meta">
                  <span>${formatDateArabic(wt.date)}</span>
                  ${wt.note ? `<span class="detail-item-sub">${wt.note}</span>` : ''}
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      `
      }
    </div>
  `;

  const renderHistoryTab = () => `
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.history} سجل أحداث الزغلول (${events.length})
        </div>
      </div>

      ${
        events.length === 0
          ? `<div class="detail-empty-box">لا توجد أحداث مسجلة بعد.</div>`
          : `
        <div class="timeline">
          ${events
            .map(
              (evt) => `
            <div class="timeline-item">
              <div class="timeline-dot timeline-dot-sm">${icons.check}</div>
              <div class="timeline-content timeline-content-sm">
                <span class="timeline-time">${formatDateTimeArabic(evt.date)}</span>
                <span class="timeline-text">${evt.note || evt.type}</span>
                ${
                  evt.oldValue || evt.newValue
                    ? `<div class="timeline-diff">
                        ${evt.oldValue ? `<span class="timeline-old-val">السابق: ${evt.oldValue}</span>` : ''}
                        ${evt.newValue ? `<span class="timeline-new-val">الجديد: ${evt.newValue}</span>` : ''}
                      </div>`
                    : ''
                }
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
      }
    </div>
  `;

  container.innerHTML = `
    <!-- Top Back Bar -->
    <div class="detail-topbar">
      <button class="btn btn-outline btn-sm" id="btn-back-origin">
        ${icons.back} ${
          batch
            ? batch.batchNumber
            : originCoop
              ? `سلاكة ${originCoop.number}`
              : 'العودة'
        }
      </button>

      <div class="detail-topbar-actions">
        <button class="btn btn-outline btn-sm" id="btn-edit-squab">
          ${icons.edit} تصحيح
        </button>
      </div>
    </div>

    <!-- Compact Hero Card -->
    <div class="card detail-hero-card">
      <div class="detail-hero-row">
        <div class="detail-hero-icon ${heroIconClass}">
          ${heroIcon}
        </div>
        <div class="detail-hero-meta">
          <h1 class="detail-hero-title">${squab.codeNumber}</h1>
          <div class="detail-hero-badges">
            <span class="badge ${statusBadgeClass}">${statusLabel}</span>
            <span class="badge badge-primary">
              ${squab.status === 'deceased' ? `العمر عند النفوق: ${formatAgeArabic(currentAge)}` : `العمر: ${formatAgeArabic(currentAge)}`}
            </span>
            ${
              isReadyForTransfer
                ? `<span class="badge badge-transfer">${icons.truck} جاهز للنقل</span>`
                : ''
            }
            ${
              isReadyForSaleNow
                ? `<span class="badge badge-success">${icons.cash} جاهز للبيع</span>`
                : ''
            }
            ${
              squab.postponedUntil
                ? `<span class="badge badge-warning">${icons.clock} مؤجل حتى ${formatDateArabic(squab.postponedUntil)}</span>`
                : ''
            }
          </div>
        </div>
      </div>
    </div>

    <!-- Horizontal Tabs -->
    <div class="detail-tabs" role="tablist">
      <button class="detail-tab ${activeSquabTab === 'summary' ? 'active' : ''}" data-tab="summary">
        ملخص
      </button>
      <button class="detail-tab ${activeSquabTab === 'weights' ? 'active' : ''}" data-tab="weights">
        الأوزان (${weights.length})
      </button>
      <button class="detail-tab ${activeSquabTab === 'history' ? 'active' : ''}" data-tab="history">
        السجل (${events.length})
      </button>
    </div>

    <!-- Active Tab Panel -->
    ${
      activeSquabTab === 'summary'
        ? renderSummaryTab()
        : activeSquabTab === 'weights'
          ? renderWeightsTab()
          : renderHistoryTab()
    }
  `;

  // Tab switching
  container.querySelectorAll('.detail-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const nextTab = (tabBtn as HTMLElement).dataset.tab as SquabTab;
      if (nextTab && nextTab !== activeSquabTab) {
        activeSquabTab = nextTab;
        renderSquabDetailView(container, squabId, navigate);
      }
    });
  });

  // Attach event handlers
  container.querySelector('#btn-back-origin')?.addEventListener('click', () => {
    if (batch) {
      navigate('batch_detail', { batchId: batch.id });
    } else if (originCoop) {
      navigate('coop_detail', { coopId: originCoop.id });
    } else {
      navigate('coops');
    }
  });

  container.querySelector('#btn-goto-coop')?.addEventListener('click', () => {
    if (originCoop) navigate('coop_detail', { coopId: originCoop.id });
  });

  container.querySelector('#btn-goto-pair')?.addEventListener('click', () => {
    if (pair) navigate('pair_detail', { pairId: pair.id });
  });

  container.querySelector('#btn-goto-batch')?.addEventListener('click', () => {
    if (batch) navigate('batch_detail', { batchId: batch.id });
  });

  container.querySelector('#btn-edit-squab')?.addEventListener('click', () => {
    showEditSquabModal(squab, () => renderSquabDetailView(container, squabId, navigate));
  });

  container.querySelector('#btn-record-death')?.addEventListener('click', () => {
    showRecordSquabDeathModal(squab, () => renderSquabDetailView(container, squabId, navigate));
  });

  container.querySelector('#btn-add-weight')?.addEventListener('click', () => {
    showAddSquabWeightModal(squab, () => renderSquabDetailView(container, squabId, navigate));
  });

  container.querySelector('#btn-postpone-sale')?.addEventListener('click', () => {
    showPostponeSaleModal([squab], squab.batchId, () =>
      renderSquabDetailView(container, squabId, navigate)
    );
  });

  container.querySelector('#btn-sell-squab')?.addEventListener('click', () => {
    showRecordSaleModal(squab.batchId, [squab.id], () =>
      renderSquabDetailView(container, squabId, navigate)
    );
  });
}
