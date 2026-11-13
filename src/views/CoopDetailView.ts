import {
  getCoop,
  getPairs,
  getEggsByCoop,
  getSquabs,
  getBatchesByCoop,
  getEventsForEntity,
  getSettings,
} from '../db/indexedDB';
import {
  getEggSchedule,
  formatDateArabic,
  formatDateTimeArabic,
  getSquabAge,
  formatAgeArabic,
  getEffectiveSaleDate,
} from '../utils/dateUtils';
import { icons } from '../utils/icons';
import {
  showEditCoopModal,
  showToggleCoopModal,
  showLayEggModal,
  showEggFertilityCheckModal,
  showEggBrokenOrLostModal,
  showAddPairModal,
  showEditPairModal,
  showChangePairModal,
  showCoopPreviousPairsModal,
  showRecordHatchModal,
  showRecordSquabDeathModal,
  showAddSquabWeightModal,
  showTransferToCollectionModal,
} from '../components/Modal';

type CoopTab = 'summary' | 'production' | 'batches' | 'history';

let lastCoopId = '';
let activeCoopTab: CoopTab = 'summary';

function getEggBadgeClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'badge-warning';
    case 'fertile':
      return 'badge-success';
    case 'hatched':
      return 'badge-squab';
    case 'broken':
    case 'lost':
      return 'badge-danger';
    default:
      return 'badge-muted';
  }
}

function getEggIconClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'detail-item-icon-warning';
    case 'fertile':
      return 'detail-item-icon-success';
    case 'hatched':
      return 'detail-item-icon-info';
    case 'broken':
    case 'lost':
      return 'detail-item-icon-danger';
    default:
      return 'detail-item-icon-muted';
  }
}

export async function renderCoopDetailView(
  container: HTMLElement,
  coopId: string,
  navigate: (view: string, params?: Record<string, string>) => void
) {
  const [coop, pairs, eggs, allSquabs, batches, events, settings] = await Promise.all([
    getCoop(coopId),
    getPairs(),
    getEggsByCoop(coopId),
    getSquabs(),
    getBatchesByCoop(coopId),
    getEventsForEntity(coopId),
    getSettings(),
  ]);

  if (!coop) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">السلاكة غير موجودة</div>
        <button class="btn btn-primary" id="btn-back-coops">${icons.back} العودة لقائمة السلاكات</button>
      </div>
    `;
    container.querySelector('#btn-back-coops')?.addEventListener('click', () => navigate('coops'));
    return;
  }

  const isCollection = coop.type === 'collection';

  if (coopId !== lastCoopId) {
    lastCoopId = coopId;
    activeCoopTab = 'summary';
  }
  if (!isCollection && activeCoopTab === 'batches') {
    activeCoopTab = 'summary';
  }
  if (isCollection && activeCoopTab === 'production') {
    activeCoopTab = 'summary';
  }

  const residentPair = pairs.find((p) => p.coopId === coop.id && p.status === 'active');
  const previousPairs = pairs.filter((p) => p.coopId === coop.id && p.status === 'inactive');
  const activeEggs = eggs.filter((e) => e.status === 'pending' || e.status === 'fertile');
  const hatchedEggs = eggs.filter((e) => e.status === 'hatched');
  const otherHistoricalEggs = eggs.filter(
    (e) => e.status === 'infertile' || e.status === 'broken' || e.status === 'lost'
  );

  // الزغاليل الحية المتواجدة حالياً في هذه السلاكة
  const liveSquabsHere = allSquabs.filter(
    (s) =>
      (s.currentLocationId === coop.id || (!s.currentLocationId && s.originCoopId === coop.id)) &&
      (s.status === 'alive_production' || s.status === 'transferred_collection')
  );

  // الزغاليل التي نفقت في هذه السلاكة
  const deceasedSquabsHere = allSquabs.filter(
    (s) =>
      (s.currentLocationId === coop.id || (!s.currentLocationId && s.originCoopId === coop.id)) &&
      s.status === 'deceased'
  );

  // الزغاليل التي نشأت أصلاً من هذه السلاكة وتم نقلها للتجميع (سجل تاريخي لسلاكة الإنتاج)
  const transferredFromHere = allSquabs.filter(
    (s) => s.originCoopId === coop.id && (s.status === 'transferred_collection' || s.status === 'sold')
  );

  const weaningDays = settings.weaningAgeDays || 20;
  const hasReadyToTransfer = liveSquabsHere.some((s) => getSquabAge(s.hatchDate) >= weaningDays);
  const readyForSaleCount = liveSquabsHere.filter((s) => getSquabAge(s.hatchDate) >= 30).length;

  const renderSummaryTab = () => {
    if (isCollection) {
      return `
        <div class="card">
          <div class="detail-kpi-grid">
            <div class="detail-kpi-item">
              <span class="detail-kpi-label">الدفعات</span>
              <strong class="detail-kpi-value detail-kpi-value-primary">${batches.length}</strong>
            </div>
            <div class="detail-kpi-item">
              <span class="detail-kpi-label">زغاليل حية</span>
              <strong class="detail-kpi-value detail-kpi-value-success">${liveSquabsHere.length}</strong>
            </div>
            <div class="detail-kpi-item">
              <span class="detail-kpi-label">جاهزة للبيع</span>
              <strong class="detail-kpi-value detail-kpi-value-info">${readyForSaleCount}</strong>
            </div>
          </div>

          ${
            coop.notes
              ? `<div class="detail-note-box"><strong>ملاحظات:</strong> ${coop.notes}</div>`
              : ''
          }

          <div class="detail-action-bar">
            <button class="btn btn-primary btn-sm btn-primary-main" id="btn-goto-batches-tab">
              ${icons.box} عرض دفعات التجميع (${batches.length})
            </button>
          </div>
        </div>
      `;
    }

    // سلاكة الإنتاج: ملخص مركز (3 أرقام أساسية + الزوج الساكن + صف إجراءات موحد)
    return `
      <div class="card">
        <div class="detail-kpi-grid">
          <div class="detail-kpi-item">
            <span class="detail-kpi-label">بيض بالحضن</span>
            <strong class="detail-kpi-value detail-kpi-value-primary">${activeEggs.length}</strong>
          </div>
          <div class="detail-kpi-item">
            <span class="detail-kpi-label">زغاليل حية</span>
            <strong class="detail-kpi-value detail-kpi-value-success">${liveSquabsHere.length}</strong>
          </div>
          <div class="detail-kpi-item">
            <span class="detail-kpi-label">أزواج سابقة</span>
            <strong class="detail-kpi-value">${previousPairs.length}</strong>
          </div>
        </div>

        ${
          residentPair
            ? `
          <div id="card-resident-pair-clickable" class="detail-subcard detail-subcard-clickable">
            <div class="detail-subcard-header">
              <div class="detail-inline-group">
                <span class="detail-item-link">${residentPair.name}</span>
                ${residentPair.breed ? `<span class="badge badge-primary">${residentPair.breed}</span>` : ''}
              </div>
              <span class="badge badge-success">نشط</span>
            </div>
            <div class="detail-item-sub">
              الذكر: <strong>${residentPair.maleInfo}</strong> • الأنثى: <strong>${residentPair.femaleInfo}</strong>
            </div>
            <div class="detail-item-sub">
              تاريخ التكوين: ${formatDateArabic(residentPair.pairedDate)}
            </div>
          </div>
        `
            : `
          <div class="detail-empty-box">
            لا يوجد زوج مسكن في هذه السلاكة حالياً.
          </div>
        `
        }

        ${
          coop.notes
            ? `<div class="detail-note-box"><strong>ملاحظات:</strong> ${coop.notes}</div>`
            : ''
        }

        <!-- Unified Action Row: 1 prominent primary action + compact secondary buttons -->
        <div class="detail-action-bar">
          ${
            !residentPair
              ? `
            <button class="btn btn-primary btn-sm btn-primary-main" id="btn-assign-pair">
              ${icons.plus} تسكين زوج جديد
            </button>
          `
              : hasReadyToTransfer
                ? `
            <button class="btn btn-primary btn-sm btn-primary-main" id="btn-transfer-to-collection">
              ${icons.truck} نقل إلى التجميع
            </button>
            ${
              coop.active
                ? `<button class="btn btn-secondary btn-sm" id="btn-lay-egg-coop">${icons.plus} وضع بيض</button>`
                : ''
            }
            <button class="btn btn-outline btn-sm" id="btn-edit-resident-pair">${icons.edit} الزوج</button>
            <button class="btn btn-outline btn-sm detail-btn-primary-text" id="btn-change-resident-pair">تغيير</button>
          `
                : `
            ${
              coop.active
                ? `<button class="btn btn-primary btn-sm btn-primary-main" id="btn-lay-egg-coop">
                    ${icons.plus} تسجيل وضع بيض
                  </button>`
                : ''
            }
            ${
              liveSquabsHere.length > 0
                ? `<button class="btn btn-secondary btn-sm" id="btn-transfer-to-collection">
                    ${icons.truck} نقل للتجميع
                  </button>`
                : ''
            }
            <button class="btn btn-outline btn-sm" id="btn-edit-resident-pair">${icons.edit} الزوج</button>
            <button class="btn btn-outline btn-sm detail-btn-primary-text" id="btn-change-resident-pair">تغيير</button>
          `
          }
        </div>
      </div>
    `;
  };

  const renderProductionTab = () => {
    return `
      <!-- Live Squabs Section -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            ${icons.squab}
            الزغاليل الحية (${liveSquabsHere.length})
          </div>
          ${
            liveSquabsHere.length > 0
              ? `<button class="btn btn-primary btn-sm" id="btn-transfer-to-collection-tab">
                  ${icons.truck} نقل إلى التجميع
                </button>`
              : ''
          }
        </div>

        ${
          liveSquabsHere.length === 0
            ? `
          <div class="detail-empty-box">
            لا توجد زغاليل حية في هذه السلاكة حالياً. (تظهر هنا تلقائياً عند تسجيل فقس أي بيضة).
          </div>
        `
            : `
          <div class="detail-section-list">
            ${liveSquabsHere
              .map((squab) => {
                const age = getSquabAge(squab.hatchDate);
                const isReady = age >= weaningDays;
                const latestWeight =
                  squab.weights && squab.weights.length > 0 ? squab.weights[squab.weights.length - 1] : null;

                return `
                <div class="detail-subcard ${isReady ? 'detail-subcard-due' : ''}">
                  <div class="detail-subcard-header">
                    <div class="detail-subcard-leading">
                      <div class="detail-item-icon detail-item-icon-success">
                        ${icons.squab}
                      </div>
                      <div class="detail-hero-meta">
                        <div class="detail-inline-group">
                          <span class="detail-item-link btn-view-squab" data-squab-id="${squab.id}">${squab.codeNumber}</span>
                          <span class="badge badge-success">حي في الإنتاج</span>
                          ${
                            isReady
                              ? `<span class="badge badge-transfer">${icons.truck} جاهز للنقل</span>`
                              : ''
                          }
                        </div>
                        <div class="detail-item-sub">
                          الفقس: ${formatDateArabic(squab.hatchDate)} • <strong>العمر: ${formatAgeArabic(age)}</strong>
                        </div>
                      </div>
                    </div>

                    <button class="btn btn-outline btn-sm btn-view-squab" data-squab-id="${squab.id}">
                      التفاصيل ←
                    </button>
                  </div>

                  ${
                    latestWeight || squab.illnessOrInjury
                      ? `
                    <div class="detail-meta-pill-box">
                      ${
                        latestWeight
                          ? `<span><strong>الوزن الأخير:</strong> ${latestWeight.weightGrams} جم (${formatDateArabic(latestWeight.date)})</span>`
                          : ''
                      }
                      ${
                        squab.illnessOrInjury
                          ? `<span class="detail-text-warning"><strong>الحالة الصحية:</strong> ${squab.illnessOrInjury}</span>`
                          : '<span class="detail-text-success"><strong>الحالة:</strong> سليم</span>'
                      }
                    </div>
                  `
                      : ''
                  }

                  <div class="detail-action-row-inline">
                    <button class="btn btn-secondary btn-sm btn-weight-squab" data-squab-id="${squab.id}">
                      ${icons.scale} تسجيل وزن
                    </button>
                    <button class="btn btn-danger btn-sm btn-death-squab" data-squab-id="${squab.id}">
                      ${icons.skull} تسجيل نفوق
                    </button>
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>
        `
        }
      </div>

      <!-- Active Eggs Section -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            ${icons.egg}
            البيض قيد الحضانة (${activeEggs.length})
          </div>
          ${
            coop.active && residentPair
              ? `<button class="btn btn-sm btn-primary" id="btn-lay-egg-coop-tab">${icons.plus} وضع بيض</button>`
              : ''
          }
        </div>

        ${
          activeEggs.length === 0
            ? `
          <div class="detail-empty-box">
            <span>لا يوجد بيض بالحضانة حالياً.</span>
            ${
              coop.active && residentPair
                ? `<button class="btn btn-outline btn-sm" id="btn-empty-lay">${icons.plus} تسجيل وضع بيض الآن</button>`
                : ''
            }
          </div>
        `
            : `
          <div class="detail-section-list">
            ${activeEggs
              .map((egg) => {
                const schedule = getEggSchedule(egg, settings);
                return `
                <div class="detail-subcard ${schedule.isCheckDue ? 'detail-subcard-due' : ''}">
                  <div class="detail-subcard-header">
                    <div class="detail-subcard-leading">
                      <div class="detail-item-icon ${getEggIconClass(egg.status)}">
                        ${icons.egg}
                      </div>
                      <div class="detail-hero-meta">
                        <div class="detail-inline-group">
                          <span class="detail-item-title">البيضة رقم ${egg.eggNumber}</span>
                          <span class="badge ${getEggBadgeClass(egg.status)}">
                            ${schedule.statusText}
                          </span>
                        </div>
                        <div class="detail-item-sub">
                          تاريخ الوضع: ${formatDateArabic(egg.laidDate)} • منذ ${schedule.daysSinceLaid} يوم
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="detail-meta-pill-box ${schedule.isCheckDue ? 'detail-countdown-due' : ''}">
                    ${schedule.countdownText}
                  </div>

                  <div class="detail-action-row-inline">
                    <button class="btn btn-primary btn-sm btn-egg-hatch" data-egg-id="${egg.id}">
                      ${icons.squab} تسجيل فقس
                    </button>
                    <button class="btn btn-secondary btn-sm btn-egg-check" data-egg-id="${egg.id}">
                      ${icons.check} فحص التخصيب
                    </button>
                    <button class="btn btn-danger btn-sm btn-egg-broken" data-egg-id="${egg.id}">
                      ${icons.eggCrack} كسر/فقد
                    </button>
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
  };

  const renderBatchesTab = () => {
    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            ${icons.box}
            دفعات التجميع (${batches.length})
          </div>
        </div>

        ${
          batches.length === 0
            ? `
          <div class="detail-empty-box">
            <strong>لا توجد دفعات تجميع في هذه السلاكة بعد</strong>
            <span>يمكنك نقل الزغاليل المفطومة (عمر 20+ يوم) من سلاكات الإنتاج إلى هنا، وستُنشأ كل عملية نقل كدفعة مستقلة.</span>
          </div>
        `
            : `
          <div class="detail-section-list">
            ${batches
              .map((batch) => {
                const bSquabs = allSquabs.filter((s) => s.batchId === batch.id);
                const bLive = bSquabs.filter(
                  (s) => s.status === 'transferred_collection' || s.status === 'alive_production'
                );
                const bSold = bSquabs.filter((s) => s.status === 'sold');

                let ageRange = '—';
                if (bLive.length > 0) {
                  const ages = bLive.map((s) => getSquabAge(s.hatchDate));
                  const min = Math.min(...ages);
                  const max = Math.max(...ages);
                  ageRange = min === max ? `${min} يوم` : `من ${min} إلى ${max} يوم`;
                }

                let targetSaleRange = '—';
                if (bLive.length > 0) {
                  const dates = bLive.map((s) => getEffectiveSaleDate(s)).sort();
                  targetSaleRange =
                    dates[0] === dates[dates.length - 1]
                      ? formatDateArabic(dates[0])
                      : `من ${formatDateArabic(dates[0])} إلى ${formatDateArabic(dates[dates.length - 1])}`;
                }

                let statusBadge = `<span class="badge badge-squab">قيد التربية</span>`;
                if (batch.status === 'fully_sold') {
                  statusBadge = `<span class="badge badge-success">مباعة بالكامل ✓</span>`;
                } else if (bLive.some((s) => getSquabAge(s.hatchDate) >= 30)) {
                  statusBadge = `<span class="badge badge-warning">جاهزة للبيع (30+ يوم)</span>`;
                }

                return `
                <div class="detail-subcard detail-subcard-clickable batch-card-item" data-batch-id="${batch.id}">
                  <div class="detail-subcard-header">
                    <div class="detail-subcard-leading">
                      <div class="detail-item-icon">${icons.box}</div>
                      <div class="detail-hero-meta">
                        <div class="detail-inline-group">
                          <span class="detail-item-title">${batch.batchNumber}</span>
                          ${statusBadge}
                        </div>
                        <div class="detail-item-sub">
                          تاريخ النقل: <strong>${formatDateArabic(batch.transferDate)}</strong>
                        </div>
                      </div>
                    </div>
                    <button class="btn btn-outline btn-sm btn-open-batch" data-batch-id="${batch.id}">
                      فتح ←
                    </button>
                  </div>

                  <div class="detail-kpi-grid">
                    <div class="detail-kpi-item">
                      <span class="detail-kpi-label">الحي</span>
                      <strong class="detail-kpi-value detail-kpi-value-success">${bLive.length}</strong>
                    </div>
                    <div class="detail-kpi-item">
                      <span class="detail-kpi-label">المباع</span>
                      <strong class="detail-kpi-value">${bSold.length}</strong>
                    </div>
                    <div class="detail-kpi-item">
                      <span class="detail-kpi-label">الأعمار</span>
                      <strong class="detail-kpi-value-sm">${ageRange}</strong>
                    </div>
                  </div>

                  <div class="detail-info-row">
                    <span class="detail-info-label">موعد البيع المستهدف:</span>
                    <strong class="detail-text-info">${targetSaleRange}</strong>
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
  };

  const renderHistoryTab = () => {
    return `
      ${
        !isCollection
          ? `
        <div class="card">
          <div class="detail-info-row">
            <div class="card-title">${icons.pair} الأزواج السابقون (${previousPairs.length})</div>
            <button class="btn btn-sm btn-outline" id="btn-previous-pairs-history">
              ${icons.history} عرض السجل
            </button>
          </div>
        </div>
      `
          : ''
      }

      ${
        !isCollection && transferredFromHere.length > 0
          ? `
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              ${icons.truck}
              زغاليل منقولة من هذه السلاكة (${transferredFromHere.length})
            </div>
          </div>
          <div class="detail-section-list">
            ${transferredFromHere
              .map((s) => {
                const isSold = s.status === 'sold';
                return `
                <div class="detail-history-row">
                  <div class="detail-inline-group">
                    <span class="squab-name-link detail-item-link" data-squab-id="${s.id}">${s.codeNumber}</span>
                    <span class="badge ${isSold ? 'badge-primary' : 'badge-muted'}">
                      ${isSold ? 'مباع ✓' : 'منقول للتجميع'}
                    </span>
                  </div>
                  <div class="detail-item-sub">
                    بعمر ${s.ageAtTransfer ?? '—'} يوم (${formatDateArabic(s.transferDate || '')})
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      ${
        deceasedSquabsHere.length > 0
          ? `
        <div class="card detail-subcard-danger">
          <div class="card-header">
            <div class="card-title detail-text-danger">
              ${icons.skull}
              زغاليل نافقة في هذه السلاكة (${deceasedSquabsHere.length})
            </div>
          </div>
          <div class="detail-section-list">
            ${deceasedSquabsHere
              .map(
                (s) => `
              <div class="detail-history-row detail-history-row-danger">
                <div class="detail-inline-group">
                  <span class="squab-name-link detail-item-link-danger" data-squab-id="${s.id}">${s.codeNumber}</span>
                  <span class="detail-item-sub">عمر النفوق: ${s.deathAgeDays ?? '—'} يوم</span>
                </div>
                <div class="detail-text-muted">
                  ${s.deathReason ? `السبب: ${s.deathReason}` : `بتاريخ ${formatDateArabic(s.deathDate || '')}`}
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      ${
        hatchedEggs.length > 0 || otherHistoricalEggs.length > 0
          ? `
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              ${icons.history}
              سجل البيض السابق (${hatchedEggs.length + otherHistoricalEggs.length})
            </div>
          </div>
          <div class="detail-scroll-list">
            ${hatchedEggs
              .map(
                (egg) => `
              <div class="detail-history-row detail-history-row-success">
                <span>البيضة رقم ${egg.eggNumber} (وضعت ${formatDateArabic(egg.laidDate)})</span>
                <span class="badge badge-success">فقست ✓ (${formatDateArabic(egg.hatchDate || '')})</span>
              </div>
            `
              )
              .join('')}
            ${otherHistoricalEggs
              .map(
                (egg) => `
              <div class="detail-history-row">
                <span>البيضة رقم ${egg.eggNumber} (وضعت ${formatDateArabic(egg.laidDate)})</span>
                <span class="badge ${egg.status === 'infertile' ? 'badge-muted' : 'badge-danger'}">
                  ${egg.status === 'infertile' ? 'رايقة' : egg.status === 'broken' ? 'مكسورة' : 'مفقودة'}
                </span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      <div class="card">
        <div class="card-header">
          <div class="card-title">
            ${icons.history}
            سجل أحداث السلاكة (${events.length})
          </div>
        </div>
        ${
          events.length === 0
            ? `<div class="detail-empty-box">لا توجد أحداث مسجلة لهذه السلاكة.</div>`
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
  };

  container.innerHTML = `
    <!-- Top Back Bar -->
    <div class="detail-topbar">
      <button class="btn btn-outline btn-sm" id="btn-back">
        ${icons.back} السلاكات
      </button>
      <div class="detail-topbar-actions">
        <button class="btn btn-outline btn-sm" id="btn-edit-coop">
          ${icons.edit} تعديل
        </button>
        <button class="btn btn-outline btn-sm ${coop.active ? 'detail-btn-danger-text' : 'detail-btn-success-text'}" id="btn-toggle-coop">
          ${coop.active ? icons.pause : icons.play}
          ${coop.active ? 'إيقاف' : 'تفعيل'}
        </button>
      </div>
    </div>

    <!-- Compact Hero Card -->
    <div class="card detail-hero-card">
      <div class="detail-hero-row">
        <div class="detail-hero-icon ${coop.active ? '' : 'detail-hero-icon-muted'}">
          ${coop.number}
        </div>
        <div class="detail-hero-meta">
          <h1 class="detail-hero-title">سلاكة رقم ${coop.number}</h1>
          <div class="detail-hero-badges">
            <span class="badge ${isCollection ? 'badge-muted' : 'badge-primary'}">
              ${isCollection ? 'تجميع وفطام' : 'إنتاج وتزاوج'}
            </span>
            <span class="badge ${coop.active ? 'badge-success' : 'badge-danger'}">
              ${coop.active ? 'نشطة' : 'متوقفة'}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Horizontal Tabs -->
    <div class="detail-tabs" role="tablist">
      <button class="detail-tab ${activeCoopTab === 'summary' ? 'active' : ''}" data-tab="summary">
        ملخص
      </button>
      ${
        isCollection
          ? `<button class="detail-tab ${activeCoopTab === 'batches' ? 'active' : ''}" data-tab="batches">
              الدفعات (${batches.length})
            </button>`
          : `<button class="detail-tab ${activeCoopTab === 'production' ? 'active' : ''}" data-tab="production">
              بيض وزغاليل (${activeEggs.length + liveSquabsHere.length})
            </button>`
      }
      <button class="detail-tab ${activeCoopTab === 'history' ? 'active' : ''}" data-tab="history">
        السجل
      </button>
    </div>

    <!-- Active Tab Panel -->
    ${
      activeCoopTab === 'summary'
        ? renderSummaryTab()
        : activeCoopTab === 'batches'
          ? renderBatchesTab()
          : activeCoopTab === 'production'
            ? renderProductionTab()
            : renderHistoryTab()
    }
  `;

  // Tab switching
  container.querySelectorAll('.detail-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const nextTab = (tabBtn as HTMLElement).dataset.tab as CoopTab;
      if (nextTab && nextTab !== activeCoopTab) {
        activeCoopTab = nextTab;
        renderCoopDetailView(container, coopId, navigate);
      }
    });
  });

  container.querySelector('#btn-goto-batches-tab')?.addEventListener('click', () => {
    activeCoopTab = 'batches';
    renderCoopDetailView(container, coopId, navigate);
  });

  // Top & Summary Handlers
  container.querySelector('#btn-back')?.addEventListener('click', () => navigate('coops'));

  container.querySelector('#btn-edit-coop')?.addEventListener('click', () => {
    showEditCoopModal(coop, () => renderCoopDetailView(container, coopId, navigate));
  });

  container.querySelector('#btn-toggle-coop')?.addEventListener('click', () => {
    showToggleCoopModal(coop, () => renderCoopDetailView(container, coopId, navigate));
  });

  container.querySelector('#card-resident-pair-clickable')?.addEventListener('click', () => {
    if (residentPair) navigate('pair_detail', { pairId: residentPair.id });
  });

  container.querySelector('#btn-edit-resident-pair')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (residentPair) {
      showEditPairModal(residentPair, () => renderCoopDetailView(container, coopId, navigate));
    }
  });

  container.querySelector('#btn-change-resident-pair')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (residentPair) {
      showChangePairModal(coop, residentPair, () => renderCoopDetailView(container, coopId, navigate));
    }
  });

  container.querySelector('#btn-previous-pairs-history')?.addEventListener('click', () => {
    showCoopPreviousPairsModal(coop, navigate);
  });

  container.querySelector('#btn-assign-pair')?.addEventListener('click', () => {
    showAddPairModal(coop.id, () => renderCoopDetailView(container, coopId, navigate));
  });

  const handleLayEgg = () => {
    if (residentPair) {
      showLayEggModal(residentPair.id, coop.id, () => renderCoopDetailView(container, coopId, navigate));
    }
  };
  container.querySelector('#btn-lay-egg-coop')?.addEventListener('click', handleLayEgg);
  container.querySelector('#btn-lay-egg-coop-tab')?.addEventListener('click', handleLayEgg);
  container.querySelector('#btn-empty-lay')?.addEventListener('click', handleLayEgg);

  const handleTransfer = () => {
    showTransferToCollectionModal(coop.id, () => renderCoopDetailView(container, coopId, navigate));
  };
  container.querySelector('#btn-transfer-to-collection')?.addEventListener('click', handleTransfer);
  container.querySelector('#btn-transfer-to-collection-tab')?.addEventListener('click', handleTransfer);

  // Batch clicks in collection coop
  container.querySelectorAll('.batch-card-item, .btn-open-batch').forEach((elem) => {
    elem.addEventListener('click', (e) => {
      e.stopPropagation();
      const bId = (elem as HTMLElement).dataset.batchId;
      if (bId) navigate('batch_detail', { batchId: bId });
    });
  });

  // Egg Hatch buttons
  container.querySelectorAll('.btn-egg-hatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      const eggId = (btn as HTMLElement).dataset.eggId;
      const targetEgg = eggs.find((e) => e.id === eggId);
      if (targetEgg) {
        showRecordHatchModal(
          targetEgg,
          residentPair ? residentPair.name : '—',
          coop.number,
          () => renderCoopDetailView(container, coopId, navigate)
        );
      }
    });
  });

  // Egg check buttons
  container.querySelectorAll('.btn-egg-check').forEach((btn) => {
    btn.addEventListener('click', () => {
      const eggId = (btn as HTMLElement).dataset.eggId;
      const targetEgg = eggs.find((e) => e.id === eggId);
      if (targetEgg) {
        showEggFertilityCheckModal(
          targetEgg,
          residentPair ? residentPair.name : '—',
          coop.number,
          () => renderCoopDetailView(container, coopId, navigate)
        );
      }
    });
  });

  // Egg broken / lost buttons
  container.querySelectorAll('.btn-egg-broken').forEach((btn) => {
    btn.addEventListener('click', () => {
      const eggId = (btn as HTMLElement).dataset.eggId;
      const targetEgg = eggs.find((e) => e.id === eggId);
      if (targetEgg) {
        showEggBrokenOrLostModal(
          targetEgg,
          residentPair ? residentPair.name : '—',
          coop.number,
          () => renderCoopDetailView(container, coopId, navigate)
        );
      }
    });
  });

  // Squab link & actions
  container.querySelectorAll('.squab-name-link, .btn-view-squab').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const squabId = (btn as HTMLElement).dataset.squabId;
      if (squabId) navigate('squab_detail', { squabId });
    });
  });

  container.querySelectorAll('.btn-weight-squab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const squabId = (btn as HTMLElement).dataset.squabId;
      const targetSquab = allSquabs.find((s) => s.id === squabId);
      if (targetSquab) {
        showAddSquabWeightModal(targetSquab, () => renderCoopDetailView(container, coopId, navigate));
      }
    });
  });

  container.querySelectorAll('.btn-death-squab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const squabId = (btn as HTMLElement).dataset.squabId;
      const targetSquab = allSquabs.find((s) => s.id === squabId);
      if (targetSquab) {
        showRecordSquabDeathModal(targetSquab, () => renderCoopDetailView(container, coopId, navigate));
      }
    });
  });
}
