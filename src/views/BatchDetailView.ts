import {
  getBatch,
  getSquabsByBatch,
  getCoop,
  getPairs,
  getEventsForEntity,
} from '../db/indexedDB';
import {
  formatDateArabic,
  formatDateTimeArabic,
  getSquabAge,
  formatAgeArabic,
  getEffectiveSaleDate,
} from '../utils/dateUtils';
import { icons } from '../utils/icons';
import {
  showRecordSaleModal,
  showPostponeSaleModal,
  showCorrectTransferDateModal,
  showAddSquabWeightModal,
  showRecordSquabDeathModal,
} from '../components/Modal';

type BatchTab = 'summary' | 'squabs' | 'history';

let lastBatchId = '';
let activeBatchTab: BatchTab = 'summary';

export async function renderBatchDetailView(
  container: HTMLElement,
  batchId: string,
  navigate: (view: string, params?: Record<string, string>) => void
) {
  const [batch, squabs, pairs, events] = await Promise.all([
    getBatch(batchId),
    getSquabsByBatch(batchId),
    getPairs(),
    getEventsForEntity(batchId),
  ]);

  if (!batch) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">الدفعة غير موجودة</div>
        <button class="btn btn-primary btn-sm" id="btn-back-coops">${icons.back} العودة للسلاكات</button>
      </div>
    `;
    container.querySelector('#btn-back-coops')?.addEventListener('click', () => navigate('coops'));
    return;
  }

  if (batchId !== lastBatchId) {
    lastBatchId = batchId;
    activeBatchTab = 'summary';
  }

  const coop = await getCoop(batch.collectionCoopId);

  const liveSquabs = squabs.filter(
    (s) => s.status === 'transferred_collection' || s.status === 'alive_production'
  );
  const soldSquabs = squabs.filter((s) => s.status === 'sold');
  const deceasedSquabs = squabs.filter((s) => s.status === 'deceased');

  // حساب نطاق الأعمار الحية في الدفعة
  let ageRangeText = '—';
  if (liveSquabs.length > 0) {
    const liveAges = liveSquabs.map((s) => getSquabAge(s.hatchDate));
    const minAge = Math.min(...liveAges);
    const maxAge = Math.max(...liveAges);
    ageRangeText = minAge === maxAge ? `${minAge} يوم` : `من ${minAge} إلى ${maxAge} يوم`;
  }

  // حساب نطاق مواعيد البيع المستهدفة
  let saleDatesRangeText = '—';
  if (liveSquabs.length > 0) {
    const dates = liveSquabs.map((s) => getEffectiveSaleDate(s)).sort();
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    saleDatesRangeText =
      firstDate === lastDate
        ? formatDateArabic(firstDate)
        : `من ${formatDateArabic(firstDate)} إلى ${formatDateArabic(lastDate)}`;
  }

  let statusBadgeClass = 'badge-squab';
  let statusArabic = 'قيد التربية';

  if (batch.status === 'fully_sold') {
    statusBadgeClass = 'badge-success';
    statusArabic = 'مباعة بالكامل ✓';
  } else if (liveSquabs.some((s) => getSquabAge(s.hatchDate) >= 30)) {
    statusBadgeClass = 'badge-warning';
    statusArabic = 'جاهزة للبيع (30+ يوم)';
  }

  const renderSummaryTab = () => `
    <div class="card">
      <!-- Quick 3-metric grid -->
      <div class="detail-kpi-grid">
        <div class="detail-kpi-item">
          <span class="detail-kpi-label">الحي بالدفعة</span>
          <strong class="detail-kpi-value detail-kpi-value-success">${liveSquabs.length}</strong>
        </div>
        <div class="detail-kpi-item">
          <span class="detail-kpi-label">المباع</span>
          <strong class="detail-kpi-value">${soldSquabs.length}</strong>
        </div>
        <div class="detail-kpi-item">
          <span class="detail-kpi-label">النافق</span>
          <strong class="detail-kpi-value ${deceasedSquabs.length > 0 ? 'detail-kpi-value-danger' : 'detail-text-muted'}">${deceasedSquabs.length}</strong>
        </div>
      </div>

      <!-- Dates & Age Box -->
      <div class="detail-info-box">
        <div class="detail-info-row">
          <span class="detail-info-label">نطاق الأعمار الحالية:</span>
          <strong class="detail-info-value">${ageRangeText}</strong>
        </div>
        <div class="detail-info-row">
          <span class="detail-info-label">مواعيد البيع المستهدفة:</span>
          <strong class="detail-text-info">${saleDatesRangeText}</strong>
        </div>
        ${
          batch.note
            ? `<div class="detail-note-box"><strong>ملاحظة:</strong> ${batch.note}</div>`
            : ''
        }
      </div>

      <!-- Grouped Action Row: 1 prominent primary CTA + compact secondary action -->
      <div class="detail-action-bar">
        <button class="btn btn-primary btn-sm btn-primary-main" id="btn-batch-sell" ${liveSquabs.length === 0 ? 'disabled' : ''}>
          ${icons.cash} تسجيل بيع
        </button>
        <button class="btn btn-outline btn-sm" id="btn-batch-postpone" ${liveSquabs.length === 0 ? 'disabled' : ''}>
          ${icons.clock} تأجيل البيع
        </button>
      </div>
    </div>
  `;

  const renderSquabsTab = () => `
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.squab} زغاليل الدفعة (${squabs.length})
        </div>
        <span class="detail-text-muted">مرتبة حسب العمر</span>
      </div>

      ${
        squabs.length === 0
          ? `<div class="detail-empty-box">لا توجد زغاليل مسجلة في هذه الدفعة.</div>`
          : `
        <div class="detail-section-list">
          ${squabs
            .map((squab) => {
              const age = getSquabAge(squab.hatchDate, squab.deathDate);
              const pair = pairs.find((p) => p.id === squab.pairId);
              const latestWeight =
                squab.weights && squab.weights.length > 0 ? squab.weights[squab.weights.length - 1] : null;
              const isAliveInBatch =
                squab.status === 'transferred_collection' || squab.status === 'alive_production';
              const isReadyForSale = isAliveInBatch && age >= 30;
              const targetSaleDateStr = getEffectiveSaleDate(squab);

              let statusBadge = `<span class="badge badge-primary">حي في التجميع</span>`;
              let iconClass = 'detail-item-icon-success';
              let iconHtml = icons.squab;

              if (squab.status === 'sold') {
                statusBadge = `<span class="badge badge-primary">مباع ✓</span>`;
                iconClass = 'detail-item-icon';
                iconHtml = icons.cash;
              } else if (squab.status === 'deceased') {
                statusBadge = `<span class="badge badge-danger">نافق (عمر ${squab.deathAgeDays ?? age} يوم)</span>`;
                iconClass = 'detail-item-icon-danger';
                iconHtml = icons.skull;
              } else if (squab.postponedUntil) {
                statusBadge = `<span class="badge badge-warning">مؤجل إلى ${formatDateArabic(squab.postponedUntil)}</span>`;
              } else if (isReadyForSale) {
                statusBadge = `<span class="badge badge-success">جاهز للبيع</span>`;
              }

              return `
              <div class="detail-subcard ${isReadyForSale ? 'detail-subcard-ready' : ''}">
                <div class="detail-subcard-header">
                  <div class="detail-subcard-leading">
                    <div class="detail-item-icon ${iconClass}">${iconHtml}</div>
                    <div class="detail-hero-meta">
                      <div class="detail-inline-group">
                        <span class="squab-name-link detail-item-link" data-squab-id="${squab.id}">
                          ${squab.codeNumber}
                        </span>
                        ${statusBadge}
                      </div>
                      <div class="detail-item-sub">
                        الزوج: <strong>${pair ? pair.name : '—'}</strong> • فقس: ${formatDateArabic(squab.hatchDate)}
                      </div>
                    </div>
                  </div>

                  <div class="detail-weight-meta">
                    <strong class="detail-info-value">${formatAgeArabic(age)}</strong>
                    ${
                      squab.ageAtTransfer !== undefined
                        ? `<span>عند النقل: ${squab.ageAtTransfer} يوم</span>`
                        : ''
                    }
                  </div>
                </div>

                <div class="detail-meta-pill-box">
                  <div>
                    البيع المستهدف: <strong>${formatDateArabic(targetSaleDateStr)}</strong>
                    ${
                      squab.postponeReason
                        ? `<div class="detail-text-warning">سبب التأجيل: ${squab.postponeReason}</div>`
                        : ''
                    }
                  </div>
                  <div>
                    آخر وزن: <strong>${latestWeight ? `${latestWeight.weightGrams} جم` : 'لم يسجل'}</strong>
                  </div>
                </div>

                ${
                  isAliveInBatch
                    ? `
                  <div class="detail-action-row-inline">
                    <button class="btn btn-secondary btn-sm btn-add-weight" data-squab-id="${squab.id}">
                      ${icons.scale} تسجيل وزن
                    </button>
                    <button class="btn btn-outline btn-sm btn-postpone-squab" data-squab-id="${squab.id}">
                      ${icons.clock} تأجيل بيعه
                    </button>
                    <button class="btn btn-danger btn-sm btn-death-squab" data-squab-id="${squab.id}">
                      ${icons.skull} نفوق
                    </button>
                  </div>
                `
                    : ''
                }
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
          ${icons.history}
          سجل أحداث هذه الدفعة (${events.length})
        </div>
      </div>

      ${
        events.length === 0
          ? `<div class="detail-empty-box">لا توجد أحداث مسجلة لهذه الدفعة.</div>`
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
    <!-- Top Action Navigation -->
    <div class="detail-topbar">
      <button class="btn btn-outline btn-sm" id="btn-back-to-coop">
        ${icons.back} سلاكة ${coop ? coop.number : ''}
      </button>

      <div class="detail-topbar-actions">
        <button class="btn btn-outline btn-sm" id="btn-correct-transfer">
          ${icons.edit} تصحيح تاريخ النقل
        </button>
      </div>
    </div>

    <!-- Compact Hero Card -->
    <div class="card detail-hero-card">
      <div class="detail-hero-row">
        <div class="detail-hero-icon">${icons.box}</div>
        <div class="detail-hero-meta">
          <div class="detail-hero-title-row">
            <h1 class="detail-hero-title">${batch.batchNumber}</h1>
            <span class="badge ${statusBadgeClass}">${statusArabic}</span>
          </div>
          <div class="detail-hero-badges">
            <span>سلاكة التجميع: <strong>${coop ? coop.number : '—'}</strong></span>
            <span>• نقل: <strong>${formatDateArabic(batch.transferDate)}</strong></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Horizontal Tabs -->
    <div class="detail-tabs" role="tablist">
      <button class="detail-tab ${activeBatchTab === 'summary' ? 'active' : ''}" data-tab="summary">
        ملخص
      </button>
      <button class="detail-tab ${activeBatchTab === 'squabs' ? 'active' : ''}" data-tab="squabs">
        الزغاليل (${squabs.length})
      </button>
      <button class="detail-tab ${activeBatchTab === 'history' ? 'active' : ''}" data-tab="history">
        السجل (${events.length})
      </button>
    </div>

    <!-- Active Tab Panel -->
    ${
      activeBatchTab === 'summary'
        ? renderSummaryTab()
        : activeBatchTab === 'squabs'
          ? renderSquabsTab()
          : renderHistoryTab()
    }
  `;

  // Tab switching
  container.querySelectorAll('.detail-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const nextTab = (tabBtn as HTMLElement).dataset.tab as BatchTab;
      if (nextTab && nextTab !== activeBatchTab) {
        activeBatchTab = nextTab;
        renderBatchDetailView(container, batchId, navigate);
      }
    });
  });

  // Handlers
  container.querySelector('#btn-back-to-coop')?.addEventListener('click', () => {
    navigate('coop_detail', { coopId: batch.collectionCoopId });
  });

  container.querySelector('#btn-correct-transfer')?.addEventListener('click', () => {
    showCorrectTransferDateModal(batch, () => renderBatchDetailView(container, batchId, navigate));
  });

  container.querySelector('#btn-batch-sell')?.addEventListener('click', () => {
    showRecordSaleModal(batch.id, [], () => renderBatchDetailView(container, batchId, navigate));
  });

  container.querySelector('#btn-batch-postpone')?.addEventListener('click', () => {
    showPostponeSaleModal(liveSquabs, batch.id, () => renderBatchDetailView(container, batchId, navigate));
  });

  container.querySelectorAll('.squab-name-link').forEach((elem) => {
    elem.addEventListener('click', () => {
      const id = (elem as HTMLElement).dataset.squabId;
      if (id) navigate('squab_detail', { squabId: id });
    });
  });

  container.querySelectorAll('.btn-add-weight').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.squabId;
      const targetSquab = squabs.find((s) => s.id === id);
      if (targetSquab) {
        showAddSquabWeightModal(targetSquab, () => renderBatchDetailView(container, batchId, navigate));
      }
    });
  });

  container.querySelectorAll('.btn-postpone-squab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.squabId;
      const targetSquab = squabs.find((s) => s.id === id);
      if (targetSquab) {
        showPostponeSaleModal([targetSquab], batch.id, () => renderBatchDetailView(container, batchId, navigate));
      }
    });
  });

  container.querySelectorAll('.btn-death-squab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.squabId;
      const targetSquab = squabs.find((s) => s.id === id);
      if (targetSquab) {
        showRecordSquabDeathModal(targetSquab, () => renderBatchDetailView(container, batchId, navigate));
      }
    });
  });
}
