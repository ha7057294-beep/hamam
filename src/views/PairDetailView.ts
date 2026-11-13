import {
  getPair,
  getCoop,
  getCyclesForPair,
  getEggsByPair,
  getSquabsByPair,
  getEventsForEntity,
  getSettings,
  calculatePairStats,
  getPairRanking,
} from '../db/indexedDB';
import {
  getEggSchedule,
  formatDateArabic,
  formatDateTimeArabic,
  getSquabAge,
  formatAgeArabic,
  getRolling6MonthsPeriod,
} from '../utils/dateUtils';
import { icons } from '../utils/icons';
import {
  showEditPairModal,
  showTogglePairModal,
  showLayEggModal,
  showEggFertilityCheckModal,
  showEggBrokenOrLostModal,
  showRecordHatchModal,
  showPairBirdCountChangeModal,
  showPairRankingDetailModal,
} from '../components/Modal';

type PairTab = 'summary' | 'cycles' | 'history';

let lastPairId = '';
let activePairTab: PairTab = 'summary';

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

function getRankAlertClass(colorIndicator?: string): string {
  switch (colorIndicator) {
    case 'green':
      return 'detail-alert-box-success';
    case 'yellow':
      return 'detail-alert-box-warning';
    case 'red':
      return 'detail-alert-box-danger';
    default:
      return '';
  }
}

function getRankBadgeClass(colorIndicator?: string): string {
  switch (colorIndicator) {
    case 'green':
      return 'badge-success';
    case 'yellow':
      return 'badge-warning';
    case 'red':
      return 'badge-danger';
    default:
      return 'badge-muted';
  }
}

export async function renderPairDetailView(
  container: HTMLElement,
  pairId: string,
  navigate: (view: string, params?: Record<string, string>) => void
) {
  const rollingPeriod = getRolling6MonthsPeriod();
  const [pair, eggs, squabs, cycles, events, settings, pairStats, pairRankingData] = await Promise.all([
    getPair(pairId),
    getEggsByPair(pairId),
    getSquabsByPair(pairId),
    getCyclesForPair(pairId),
    getEventsForEntity(pairId),
    getSettings(),
    calculatePairStats(pairId),
    getPairRanking(rollingPeriod.fromDate, rollingPeriod.toDate),
  ]);

  if (!pair) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">الزوج غير موجود</div>
        <button class="btn btn-primary" id="btn-back-coops">${icons.back} العودة لقائمة السلاكات</button>
      </div>
    `;
    container.querySelector('#btn-back-coops')?.addEventListener('click', () => navigate('coops'));
    return;
  }

  if (pairId !== lastPairId) {
    lastPairId = pairId;
    activePairTab = 'summary';
  }

  const rankingItem = [...pairRankingData.rankedPairs, ...pairRankingData.insufficientDataPairs].find(
    (p) => p.pairId === pairId
  );
  const rankIndex =
    rankingItem && rankingItem.hasSufficientData
      ? pairRankingData.rankedPairs.findIndex((p) => p.pairId === pairId) + 1
      : null;

  const coop = pair.coopId ? await getCoop(pair.coopId) : null;

  const renderSummaryTab = () => `
    <div class="card">
      <!-- Top 4 Non-duplicated Key Metrics -->
      <div class="detail-kpi-grid-2">
        <div class="detail-kpi-item">
          <span class="detail-kpi-label">إجمالي البيض</span>
          <strong class="detail-kpi-value">${pairStats.totalEggs}</strong>
        </div>
        <div class="detail-kpi-item">
          <span class="detail-kpi-label">الزغاليل الحية</span>
          <strong class="detail-kpi-value detail-kpi-value-success">${pairStats.liveSquabs}</strong>
        </div>
        <div class="detail-kpi-item">
          <span class="detail-kpi-label">الزغاليل المباعة</span>
          <strong class="detail-kpi-value detail-kpi-value-info">${pairStats.soldSquabs}</strong>
        </div>
        <div class="detail-kpi-item">
          <span class="detail-kpi-label">إيراد المبيعات</span>
          <strong class="detail-kpi-value detail-kpi-value-success">${pairStats.salesRevenue} ج.م</strong>
        </div>
      </div>

      <!-- Coop & Bird Count -->
      <div class="detail-info-grid">
        <div class="detail-info-box">
          <span class="detail-info-label">السلاكة</span>
          <div class="detail-info-row">
            <strong class="detail-info-value">${coop ? `سلاكة ${coop.number}` : 'غير مسكن'}</strong>
            ${
              coop
                ? `<button class="btn btn-outline btn-sm" id="btn-goto-coop">فتح ←</button>`
                : ''
            }
          </div>
        </div>

        <div class="detail-info-box">
          <span class="detail-info-label">الأفراد الفعلية (للعلف)</span>
          <div class="detail-info-row">
            <strong class="detail-info-value">
              ${pair.currentBirdCount ?? 2} فرد
              ${(pair.currentBirdCount ?? 2) < 2 ? '<span class="detail-text-warning">(ناقص)</span>' : ''}
            </strong>
            <button class="btn btn-outline btn-sm" id="btn-change-bird-count">${icons.tune} تعديل</button>
          </div>
        </div>
      </div>

      <!-- Male & Female Info -->
      <div class="detail-info-grid">
        <div class="detail-gender-male">
          <div class="detail-gender-male-title">${icons.male} الذكر</div>
          <div class="detail-item-sub">${pair.maleInfo}</div>
        </div>
        <div class="detail-gender-female">
          <div class="detail-gender-female-title">${icons.female} الأنثى</div>
          <div class="detail-item-sub">${pair.femaleInfo}</div>
        </div>
      </div>

      <!-- Compact 6-Month Evaluation Line (Detailed breakdown in modal / ReportsView) -->
      <div class="detail-alert-box ${getRankAlertClass(rankingItem?.colorIndicator)}">
        <div class="detail-info-row">
          <span class="detail-info-value">
            ${
              rankIndex !== null
                ? `التقييم (6 أشهر): المركز #${rankIndex} من ${pairRankingData.rankedPairs.length}`
                : rankingItem?.insufficientDataReason || 'التقييم: بيانات غير كافية بعد (أقل من دورتين)'
            }
          </span>
          ${
            rankingItem
              ? `<span class="badge ${getRankBadgeClass(rankingItem.colorIndicator)}">${rankingItem.colorIndicatorLabel}</span>`
              : ''
          }
        </div>
      </div>

      ${
        pair.notes
          ? `<div class="detail-note-box"><strong>ملاحظات:</strong> ${pair.notes}</div>`
          : ''
      }

      <!-- Grouped Actions: 1 prominent primary CTA + compact secondary actions -->
      <div class="detail-action-bar">
        ${
          pair.status === 'active'
            ? `<button class="btn btn-primary btn-sm btn-primary-main" id="btn-lay-egg-pair">
                ${icons.plus} تسجيل وضع بيض
              </button>`
            : ''
        }
        ${
          rankingItem
            ? `<button type="button" class="btn btn-secondary btn-sm" id="btn-pair-rank-detail">
                تفاصيل التقييم
              </button>`
            : ''
        }
        <button type="button" class="btn btn-outline btn-sm" id="btn-pair-all-reports">
          جدول الترتيب ←
        </button>
      </div>
    </div>
  `;

  const renderCyclesTab = () => `
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.egg}
          العشوش والدورات (${cycles.length})
        </div>
        ${
          pair.status === 'active'
            ? `<button class="btn btn-sm btn-primary" id="btn-lay-egg-pair-tab">${icons.plus} وضع بيض</button>`
            : ''
        }
      </div>

      ${
        cycles.length === 0
          ? `
        <div class="detail-empty-box">
          <span>لم يسجل هذا الزوج أي دورة إنتاج (عش) حتى الآن.</span>
          ${
            pair.status === 'active'
              ? `<button class="btn btn-primary btn-sm" id="btn-first-egg-pair">${icons.plus} تسجيل أول وضع بيض</button>`
              : ''
          }
        </div>
      `
          : `
        <div class="detail-section-list">
          ${cycles
            .map((cycle) => {
              const cycleEggs = eggs.filter((e) => e.cycleId === cycle.id);
              const cycleSquabs = squabs.filter((s) => s.cycleId === cycle.id);

              return `
              <div class="detail-cycle-card">
                <div class="detail-cycle-header">
                  <div class="detail-inline-group">
                    <span class="detail-item-link">عش رقم ${cycle.cycleNumber}</span>
                    <span class="badge ${cycle.status === 'active' ? 'badge-primary' : 'badge-muted'}">
                      ${cycle.status === 'active' ? 'نشط' : 'مكتمل'}
                    </span>
                  </div>
                  <span class="detail-text-muted">${formatDateArabic(cycle.startDate)}</span>
                </div>

                <div class="detail-section-list">
                  <div class="detail-section-heading">
                    ${icons.egg} البيض (${cycleEggs.length})
                  </div>

                  ${
                    cycleEggs.length === 0
                      ? `<div class="detail-item-sub">لم يتم تسجيل بيض في هذه الدورة بعد.</div>`
                      : cycleEggs
                          .map((egg) => {
                            const schedule = getEggSchedule(egg, settings);
                            const isLiveEgg =
                              egg.status !== 'broken' &&
                              egg.status !== 'lost' &&
                              egg.status !== 'infertile' &&
                              egg.status !== 'hatched';

                            return `
                            <div class="detail-egg-inner-card">
                              <div class="detail-info-row">
                                <div class="detail-inline-group">
                                  <span class="detail-item-title">البيضة رقم ${egg.eggNumber}</span>
                                  <span class="badge ${getEggBadgeClass(egg.status)}">${schedule.statusText}</span>
                                </div>
                                <span class="detail-text-muted">وضع: ${formatDateArabic(egg.laidDate)}</span>
                              </div>

                              <div class="detail-item-sub ${schedule.isCheckDue ? 'detail-countdown-due' : ''}">
                                ${schedule.countdownText}
                              </div>

                              ${
                                isLiveEgg
                                  ? `
                                <div class="detail-action-row-inline">
                                  <button class="btn btn-primary btn-sm btn-egg-hatch" data-egg-id="${egg.id}">
                                    ${icons.squab} تسجيل فقس
                                  </button>
                                  ${
                                    egg.status === 'pending'
                                      ? `<button class="btn btn-secondary btn-sm btn-egg-check" data-egg-id="${egg.id}">
                                          ${icons.check} فحص التخصيب
                                        </button>`
                                      : ''
                                  }
                                  ${
                                    egg.status === 'pending' || egg.status === 'fertile'
                                      ? `<button class="btn btn-danger btn-sm btn-egg-broken" data-egg-id="${egg.id}">
                                          ${icons.eggCrack} كسر/فقد
                                        </button>`
                                      : ''
                                  }
                                </div>
                              `
                                  : ''
                              }
                            </div>
                          `;
                          })
                          .join('')
                  }
                </div>

                ${
                  cycleSquabs.length > 0
                    ? `
                  <div class="detail-nested-squabs">
                    <div class="detail-section-heading">
                      ${icons.squab} الزغاليل الناتجة (${cycleSquabs.length})
                    </div>
                    ${cycleSquabs
                      .map((sqb) => {
                        const age = getSquabAge(sqb.hatchDate, sqb.deathDate);
                        const isAlive = sqb.status === 'alive_production';
                        const isDeceased = sqb.status === 'deceased';

                        return `
                        <div class="detail-egg-inner-card ${isDeceased ? 'detail-subcard-danger' : 'detail-subcard-ready'}">
                          <div class="detail-info-row">
                            <div class="detail-subcard-leading">
                              <div class="detail-item-icon ${isDeceased ? 'detail-item-icon-danger' : 'detail-item-icon-success'}">
                                ${isDeceased ? icons.skull : icons.squab}
                              </div>
                              <div class="detail-hero-meta">
                                <div class="detail-inline-group">
                                  <strong class="detail-item-title">${sqb.codeNumber}</strong>
                                  <span class="badge ${isDeceased ? 'badge-danger' : isAlive ? 'badge-success' : 'badge-primary'}">
                                    ${isDeceased ? 'نافق' : isAlive ? 'حي' : sqb.status === 'sold' ? 'مباع' : 'بالتجميع'}
                                  </span>
                                </div>
                                <span class="detail-item-sub">
                                  فقس: ${formatDateArabic(sqb.hatchDate)} • ${isDeceased ? `توفي بعمر ${age} يوم` : `العمر: ${formatAgeArabic(age)}`}
                                </span>
                              </div>
                            </div>
                            <button class="btn btn-outline btn-sm btn-view-squab" data-squab-id="${sqb.id}">
                              التفاصيل ←
                            </button>
                          </div>
                        </div>
                      `;
                      })
                      .join('')}
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
          سجل أحداث الزوج (${events.length})
        </div>
      </div>

      ${
        events.length === 0
          ? `<div class="detail-empty-box">لا توجد أحداث مسجلة لهذا الزوج حتى الآن.</div>`
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
      <button class="btn btn-outline btn-sm" id="btn-back">
        ${icons.back} ${coop ? `سلاكة ${coop.number}` : 'السلاكات'}
      </button>
      <div class="detail-topbar-actions">
        <button class="btn btn-outline btn-sm" id="btn-edit-pair">
          ${icons.edit} تعديل
        </button>
        <button class="btn btn-outline btn-sm ${pair.status === 'active' ? 'detail-btn-danger-text' : 'detail-btn-success-text'}" id="btn-toggle-pair">
          ${pair.status === 'active' ? icons.pause : icons.play}
          ${pair.status === 'active' ? 'إيقاف' : 'تنشيط'}
        </button>
      </div>
    </div>

    <!-- Compact Hero Card -->
    <div class="card detail-hero-card">
      <div class="detail-hero-row">
        <div class="detail-hero-icon ${pair.status === 'active' ? '' : 'detail-hero-icon-muted'}">
          ${icons.pair}
        </div>
        <div class="detail-hero-meta">
          <div class="detail-hero-title-row">
            <h1 class="detail-hero-title">${pair.name}</h1>
            ${pair.breed ? `<span class="badge badge-primary">${pair.breed}</span>` : ''}
          </div>
          <div class="detail-hero-badges">
            <span class="badge ${pair.status === 'active' ? 'badge-success' : 'badge-danger'}">
              ${pair.status === 'active' ? 'نشط' : 'متوقف'}
            </span>
            <span>تكوين: ${formatDateArabic(pair.pairedDate)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Horizontal Tabs -->
    <div class="detail-tabs" role="tablist">
      <button class="detail-tab ${activePairTab === 'summary' ? 'active' : ''}" data-tab="summary">
        ملخص
      </button>
      <button class="detail-tab ${activePairTab === 'cycles' ? 'active' : ''}" data-tab="cycles">
        العشوش (${cycles.length})
      </button>
      <button class="detail-tab ${activePairTab === 'history' ? 'active' : ''}" data-tab="history">
        السجل (${events.length})
      </button>
    </div>

    <!-- Active Tab Panel -->
    ${
      activePairTab === 'summary'
        ? renderSummaryTab()
        : activePairTab === 'cycles'
          ? renderCyclesTab()
          : renderHistoryTab()
    }
  `;

  // Tab switching
  container.querySelectorAll('.detail-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const nextTab = (tabBtn as HTMLElement).dataset.tab as PairTab;
      if (nextTab && nextTab !== activePairTab) {
        activePairTab = nextTab;
        renderPairDetailView(container, pairId, navigate);
      }
    });
  });

  // Navigation & Top actions
  container.querySelector('#btn-back')?.addEventListener('click', () => {
    if (pair.coopId) {
      navigate('coop_detail', { coopId: pair.coopId });
    } else {
      navigate('coops');
    }
  });

  container.querySelector('#btn-goto-coop')?.addEventListener('click', () => {
    if (pair.coopId) navigate('coop_detail', { coopId: pair.coopId });
  });

  container.querySelector('#btn-change-bird-count')?.addEventListener('click', () => {
    showPairBirdCountChangeModal(pair, () => renderPairDetailView(container, pairId, navigate));
  });

  container.querySelector('#btn-edit-pair')?.addEventListener('click', () => {
    showEditPairModal(pair, () => renderPairDetailView(container, pairId, navigate));
  });

  container.querySelector('#btn-toggle-pair')?.addEventListener('click', () => {
    showTogglePairModal(pair, () => renderPairDetailView(container, pairId, navigate));
  });

  const handleLayEgg = () => {
    showLayEggModal(pair.id, pair.coopId, () => renderPairDetailView(container, pairId, navigate));
  };
  container.querySelector('#btn-lay-egg-pair')?.addEventListener('click', handleLayEgg);
  container.querySelector('#btn-lay-egg-pair-tab')?.addEventListener('click', handleLayEgg);
  container.querySelector('#btn-first-egg-pair')?.addEventListener('click', handleLayEgg);

  // Egg actions
  container.querySelectorAll('.btn-egg-hatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      const eggId = (btn as HTMLElement).dataset.eggId;
      const targetEgg = eggs.find((e) => e.id === eggId);
      if (targetEgg) {
        showRecordHatchModal(
          targetEgg,
          pair.name,
          coop ? coop.number : '—',
          () => renderPairDetailView(container, pairId, navigate)
        );
      }
    });
  });

  container.querySelectorAll('.btn-egg-check').forEach((btn) => {
    btn.addEventListener('click', () => {
      const eggId = (btn as HTMLElement).dataset.eggId;
      const targetEgg = eggs.find((e) => e.id === eggId);
      if (targetEgg) {
        showEggFertilityCheckModal(
          targetEgg,
          pair.name,
          coop ? coop.number : '—',
          () => renderPairDetailView(container, pairId, navigate)
        );
      }
    });
  });

  container.querySelectorAll('.btn-egg-broken').forEach((btn) => {
    btn.addEventListener('click', () => {
      const eggId = (btn as HTMLElement).dataset.eggId;
      const targetEgg = eggs.find((e) => e.id === eggId);
      if (targetEgg) {
        showEggBrokenOrLostModal(
          targetEgg,
          pair.name,
          coop ? coop.number : '—',
          () => renderPairDetailView(container, pairId, navigate)
        );
      }
    });
  });

  // Squab link buttons
  container.querySelectorAll('.btn-view-squab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const squabId = (btn as HTMLElement).dataset.squabId;
      if (squabId) navigate('squab_detail', { squabId });
    });
  });

  // Ranking buttons
  container.querySelector('#btn-pair-rank-detail')?.addEventListener('click', () => {
    if (rankingItem) {
      showPairRankingDetailModal(rankingItem, rollingPeriod.fromDate, rollingPeriod.toDate, navigate);
    }
  });

  container.querySelector('#btn-pair-all-reports')?.addEventListener('click', () => {
    navigate('reports');
  });
}
