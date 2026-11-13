import {
  calculateFarmStats,
  calculateFinancialResults,
  getTodayTasks,
  completeTask,
  getLastUndoableAction,
  clearLastUndoableAction,
} from '../db/indexedDB';
import { getFirstDayOfMonth, getTodayDate } from '../utils/dateUtils';
import { icons } from '../utils/icons';
import {
  showLayEggModal,
  showAddExpenseModal,
  showSnoozeTaskModal,
  showUndoModal,
} from '../components/Modal';
import { showToast } from '../components/Toast';

let showAllPriorityTasks = false;
let isTasksAccordionOpen = false;

export async function renderDashboardView(
  container: HTMLElement,
  navigate: (view: string, params?: Record<string, string>) => void
) {
  const [stats, monthFinancials, todayTasks, lastUndoable] = await Promise.all([
    calculateFarmStats(),
    calculateFinancialResults(getFirstDayOfMonth(), getTodayDate()),
    getTodayTasks(),
    getLastUndoableAction(),
  ]);

  const isUndoValid =
    lastUndoable && Date.now() - new Date(lastUndoable.timestamp).getTime() <= 15 * 60 * 1000;

  const priorityTasks = todayTasks.filter((t) => t.type !== 'backup_reminder');
  const backupTask = todayTasks.find((t) => t.type === 'backup_reminder');
  const totalTasksCount = todayTasks.length;
  const hasUrgentTasks = todayTasks.some((t) => t.isUrgent);

  if (totalTasksCount === 0) {
    isTasksAccordionOpen = false;
  }

  if (priorityTasks.length <= 5) {
    showAllPriorityTasks = false;
  }
  const visibleTasks = showAllPriorityTasks ? priorityTasks : priorityTasks.slice(0, 5);
  const isAccordionOpen = totalTasksCount > 0 && isTasksAccordionOpen;

  const liveSquabsTotal = stats.liveSquabsProduction + stats.liveSquabsCollection;
  const monthProfit = monthFinancials.netOperatingProfit;
  const monthProfitClass = monthProfit >= 0 ? 'kpi-val-positive' : 'kpi-val-negative';

  container.innerHTML = `
    ${
      isUndoValid && lastUndoable
        ? `
      <div class="undo-banner">
        <div class="undo-banner-text">
          <span>${icons.undo}</span>
          <span class="undo-banner-desc">تراجع متاح: ${lastUndoable.description}</span>
        </div>
        <div class="undo-banner-actions">
          <button type="button" class="btn-undo-confirm" id="btn-undo-action">تراجع</button>
          <button type="button" class="btn-undo-dismiss" id="btn-dismiss-undo">إخفاء</button>
        </div>
      </div>
    `
        : ''
    }

    <!-- مهام وتنبيهات اليوم (قائمة قابلة للطي) -->
    <section class="card tasks-accordion-card ${hasUrgentTasks ? 'tasks-card-alert' : ''}">
      <button
        type="button"
        class="tasks-accordion-header ${hasUrgentTasks ? 'tasks-accordion-urgent' : ''}"
        id="btn-tasks-accordion"
        aria-expanded="${isAccordionOpen ? 'true' : 'false'}"
        ${totalTasksCount === 0 ? 'disabled' : ''}
      >
        <span class="tasks-accordion-leading">
          <span class="tasks-card-icon">${icons.tasks}</span>
          <span class="tasks-accordion-title">مهام وتنبيهات اليوم</span>
        </span>
        <span class="tasks-accordion-trailing">
          ${
            totalTasksCount === 0
              ? '<span class="tasks-empty-status">لا توجد تنبيهات</span>'
              : `
            ${hasUrgentTasks ? '<span class="task-urgent-tag">عاجل</span>' : ''}
            <span class="tasks-count-badge ${hasUrgentTasks ? 'tasks-count-badge-urgent' : ''}">${totalTasksCount}</span>
            <span class="tasks-accordion-chevron">${icons.chevronDown}</span>
          `
          }
        </span>
      </button>

      ${
        totalTasksCount > 0
          ? `
        <div class="tasks-accordion-body ${isAccordionOpen ? 'open' : ''}" id="tasks-accordion-body">
          <div class="tasks-accordion-body-inner">
            <div class="tasks-accordion-content">
              ${
                priorityTasks.length === 0
                  ? `
                <div class="tasks-empty-line">
                  <span>${icons.check}</span>
                  <span>لا توجد مهام أو تنبيهات معلقة اليوم</span>
                </div>
              `
                  : `
                <div class="tasks-list">
                  ${visibleTasks
                    .map(
                      (task) => `
                    <div
                      class="task-row ${task.isUrgent ? 'task-row-urgent' : ''}"
                      data-task-id="${task.id}"
                      data-task-type="${task.type}"
                      data-coop-id="${task.coopId || ''}"
                      data-batch-id="${task.batchId || ''}"
                      data-pair-id="${task.pairId || ''}"
                    >
                      <div class="task-row-line1 task-click-target">
                        <div class="task-title-wrap">
                          <span class="task-title">${task.title}</span>
                        </div>
                        ${task.isUrgent ? '<span class="task-urgent-tag">عاجل</span>' : ''}
                      </div>
                      <div class="task-row-line2">
                        <span class="task-subtitle task-click-target">${task.subtitle}</span>
                        <div class="task-actions-inline">
                          <button type="button" class="btn-task-done btn-complete-task" data-task-id="${task.id}">
                            تم
                          </button>
                          <button type="button" class="btn-task-snooze btn-snooze-task" data-task-id="${task.id}">
                            تذكير لاحقاً
                          </button>
                        </div>
                      </div>
                    </div>
                  `
                    )
                    .join('')}
                </div>
                ${
                  priorityTasks.length > 5
                    ? `
                  <button type="button" class="tasks-show-all-btn" id="btn-toggle-all-tasks">
                    ${showAllPriorityTasks ? 'عرض أقل' : `عرض الكل (${priorityTasks.length})`}
                  </button>
                `
                    : ''
                }
              `
              }

              ${
                backupTask
                  ? `
                <div
                  class="backup-reminder-row"
                  data-task-id="${backupTask.id}"
                  data-task-type="backup_reminder"
                >
                  <div class="backup-reminder-info task-click-target">
                    <span>${icons.database}</span>
                    <span>${backupTask.subtitle} — اضغط للنسخ الاحتياطي</span>
                  </div>
                  <div class="task-actions-inline">
                    <button type="button" class="btn-task-done btn-complete-task" data-task-id="${backupTask.id}">
                      تم
                    </button>
                    <button type="button" class="btn-task-snooze btn-snooze-task" data-task-id="${backupTask.id}">
                      تذكير لاحقاً
                    </button>
                  </div>
                </div>
              `
                  : ''
              }

              <div class="tasks-footer-actions">
                <button type="button" class="btn btn-outline btn-sm" id="btn-alert-types-settings">
                  ${icons.settings}
                  <span>أنواع التنبيهات</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `
          : ''
      }
    </section>

    <!-- 4 أرقام رئيسية في صف واحد -->
    <section class="kpi-strip">
      <div class="kpi-card" id="kpi-active-pairs">
        <div class="kpi-num kpi-val-primary">${stats.activePairs}</div>
        <div class="kpi-label">الأزواج النشطة</div>
      </div>

      <div class="kpi-card" id="kpi-incubating-eggs">
        <div class="kpi-num">${stats.currentIncubatingEggs}</div>
        <div class="kpi-label">البيض بالحضن</div>
      </div>

      <div class="kpi-card" id="kpi-live-squabs">
        <div class="kpi-num">${liveSquabsTotal}</div>
        <div class="kpi-label">الزغاليل الحية</div>
      </div>

      <div class="kpi-card" id="kpi-month-profit">
        <div class="kpi-num ${monthProfitClass}">${monthProfit}</div>
        <div class="kpi-label">ربح الشهر (ج.م)</div>
      </div>
    </section>

    <!-- زرارين فعل سريع -->
    <section class="quick-actions-row">
      <button type="button" class="btn btn-primary quick-action-btn" id="btn-quick-egg">
        ${icons.egg}
        <span>تسجيل بيض</span>
      </button>
      <button type="button" class="btn btn-secondary quick-action-btn" id="btn-quick-expense">
        ${icons.receipt}
        <span>تسجيل مصروف</span>
      </button>
    </section>
  `;

  const refreshDashboard = async () => {
    window.dispatchEvent(new Event('farm-data-updated'));
    await (window as any).refreshAlertBadge?.();
    await renderDashboardView(container, navigate);
  };

  // Accordion toggle
  const accordionBtn = container.querySelector('#btn-tasks-accordion') as HTMLButtonElement | null;
  const accordionBody = container.querySelector('#tasks-accordion-body');
  if (accordionBtn && accordionBody && totalTasksCount > 0) {
    accordionBtn.addEventListener('click', () => {
      isTasksAccordionOpen = !isTasksAccordionOpen;
      accordionBtn.setAttribute('aria-expanded', isTasksAccordionOpen ? 'true' : 'false');
      accordionBody.classList.toggle('open', isTasksAccordionOpen);
    });
  }

  // Alert types shortcut inside expanded body
  container.querySelector('#btn-alert-types-settings')?.addEventListener('click', () => {
    navigate('settings');
  });

  // Toggle "عرض الكل (N)"
  container.querySelector('#btn-toggle-all-tasks')?.addEventListener('click', () => {
    showAllPriorityTasks = !showAllPriorityTasks;
    renderDashboardView(container, navigate);
  });

  // KPI cards navigation
  container.querySelector('#kpi-active-pairs')?.addEventListener('click', () => navigate('coops'));
  container.querySelector('#kpi-incubating-eggs')?.addEventListener('click', () => navigate('eggs'));
  container.querySelector('#kpi-live-squabs')?.addEventListener('click', () => navigate('coops'));
  container.querySelector('#kpi-month-profit')?.addEventListener('click', () => navigate('finances'));

  // Quick action buttons
  container.querySelector('#btn-quick-egg')?.addEventListener('click', () => {
    showLayEggModal(null, null, refreshDashboard);
  });

  container.querySelector('#btn-quick-expense')?.addEventListener('click', () => {
    showAddExpenseModal(undefined, refreshDashboard);
  });

  // Undo actions
  container.querySelector('#btn-undo-action')?.addEventListener('click', () => {
    if (lastUndoable) {
      showUndoModal(lastUndoable, refreshDashboard);
    }
  });

  container.querySelector('#btn-dismiss-undo')?.addEventListener('click', async () => {
    await clearLastUndoableAction();
    refreshDashboard();
  });

  // Complete task ("تم")
  container.querySelectorAll('.btn-complete-task').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = (btn as HTMLElement).dataset.taskId;
      if (taskId) {
        try {
          await completeTask(taskId);
          showToast('تم تعليم المهمة كمنفذة بنجاح', 'success');
          await refreshDashboard();
        } catch {
          showToast('فشل تسجيل إتمام المهمة', 'error');
        }
      }
    });
  });

  // Snooze task ("تذكير لاحقاً")
  container.querySelectorAll('.btn-snooze-task').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = (btn as HTMLElement).dataset.taskId;
      const task = todayTasks.find((t) => t.id === taskId);
      if (task) {
        showSnoozeTaskModal(task, refreshDashboard);
      }
    });
  });

  // Task navigation click
  container.querySelectorAll('.task-click-target').forEach((target) => {
    target.addEventListener('click', () => {
      const parent = target.closest('[data-task-id]') as HTMLElement | null;
      if (!parent) return;

      const taskType = parent.dataset.taskType;
      const batchId = parent.dataset.batchId;
      const coopId = parent.dataset.coopId;
      const pairId = parent.dataset.pairId;

      if (taskType === 'low_feed_stock') {
        navigate('inventory');
      } else if (taskType === 'backup_reminder') {
        navigate('settings');
      } else if (taskType === 'ready_for_transfer' && coopId) {
        navigate('coop_detail', { coopId });
      } else if (batchId) {
        navigate('batch_detail', { batchId });
      } else if (pairId) {
        navigate('pair_detail', { pairId });
      } else if (coopId) {
        navigate('coop_detail', { coopId });
      }
    });
  });
}
