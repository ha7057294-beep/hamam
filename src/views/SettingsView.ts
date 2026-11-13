import {
  getSettings,
  updateSettings,
  getAllEvents,
  calculateFarmStats,
  getFeedRateConfigs,
  getFeedTypes,
  setPrimaryFeedType,
  updateAlertPreferences,
  updatePairRankingThresholds,
  exportBackupData,
  checkDataIntegrity,
  isStoragePersisted,
  requestStoragePersistence,
  loadDemoData,
  deleteDemoData,
} from '../db/indexedDB';
import { formatDateTimeArabic, formatDateArabic, getTodayDate } from '../utils/dateUtils';
import { icons } from '../utils/icons';
import { showToast } from '../components/Toast';
import {
  showAddFeedRateConfigModal,
  showDataIntegrityModal,
  showRestoreBackupModal,
  showWipeAllDataModal,
  showResetFeedInventoryModal,
  showPWAInstallGuideModal,
  showQuickSearchModal,
  showTestSuiteModal,
} from '../components/Modal';

function triggerFileDownload(content: string, fileName: string, contentType = 'application/json') {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 150);
}

export async function renderSettingsView(
  container: HTMLElement,
  navigate: (view: string, params?: Record<string, string>) => void
) {
  const [settings, stats, events, rateConfigs, feedTypes, integrityReport, storagePersisted] =
    await Promise.all([
      getSettings(),
      calculateFarmStats(),
      getAllEvents(30),
      getFeedRateConfigs(),
      getFeedTypes({ activeOnly: true }),
      checkDataIntegrity(),
      isStoragePersisted(),
    ]);

  container.innerHTML = `
    <!-- Header -->
    <div class="settings-header-row">
      <div>
        <h1 class="list-view-title">الإعدادات الموحدة والمزامنة</h1>
        <p class="detail-item-sub">ضبط معايير المزرعة، النسخ الاحتياطي، وفحص سلامة البيانات</p>
      </div>
      <div class="settings-header-actions">
        <button class="btn btn-outline btn-sm" id="btn-quick-search-header" title="بحث سريع">
          ${icons.search || ''} بحث
        </button>
        <button class="btn btn-outline btn-sm" id="btn-back-dashboard">
          ${icons.home} الرئيسية
        </button>
      </div>
    </div>

    <!-- 1. شريط فحص سلامة البيانات السريع -->
    <div class="card" style="border-color:${integrityReport.criticalCount > 0 ? '#FCA5A5' : integrityReport.warningCount > 0 ? '#FDE68A' : '#C8E6C9'};background:${integrityReport.criticalCount > 0 ? '#FFF5F5' : integrityReport.warningCount > 0 ? '#FFFDF5' : '#E8F5E9'};">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:44px;height:44px;border-radius:var(--radius-md);background:${integrityReport.criticalCount > 0 ? '#DC2626' : integrityReport.warningCount > 0 ? '#D97706' : '#16A34A'};color:#FFFFFF;display:flex;align-items:center;justify-content:center;">
            ${icons.shieldCheck || ''}
          </div>
          <div>
            <div style="font-weight:800;font-size:1rem;color:${integrityReport.criticalCount > 0 ? '#991B1B' : integrityReport.warningCount > 0 ? '#92400E' : '#166534'};">
              فحص سلامة وتناسق البيانات
            </div>
            <div style="font-size:0.86rem;color:var(--text-secondary);">
              ${
                integrityReport.totalIssuesCount === 0
                  ? 'جميع سجلات المزرعة سليمة 100% بدون أي تعارضات أو أخطاء.'
                  : `يوجد ${integrityReport.criticalCount} خطأ حرج و ${integrityReport.warningCount} ملاحظة تحتاج مراجعتك اليدوية.`
              }
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="btn-run-tests" style="font-size:0.86rem;">
            ${icons.check} فحص السيناريوهات الـ 13
          </button>
          <button class="btn btn-primary btn-sm" id="btn-open-integrity-modal">
            ${icons.shieldCheck || ''} عرض نتائج الفحص
          </button>
        </div>
      </div>
    </div>

    <!-- 2. النسخ الاحتياطي والاستعادة (المرحلة السادسة) -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.database || ''}
          النسخ الاحتياطي والاستعادة
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        <p style="font-size:0.86rem;color:var(--text-secondary);margin:0;">
          تخزين بياناتك يتم محلياً بالكامل في هاتفك. يُنصح بتصدير نسخة احتياطية دورياً وحفظها في مكان آمن.
        </p>

        <div class="responsive-two-col">
          <button class="btn btn-primary btn-lg" id="btn-export-backup">
            ${icons.download || ''} تصدير نسخة احتياطية
          </button>
          <button class="btn btn-outline btn-lg" id="btn-restore-backup">
            ${icons.database || ''} استعادة نسخة سابقة
          </button>
        </div>

        <div style="background-color:var(--surface-subtle);padding:12px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);display:flex;flex-direction:column;gap:10px;margin-top:4px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;font-size:0.86rem;">
            <span style="color:var(--text-secondary);">تاريخ آخر نسخة احتياطية:</span>
            <strong>${settings.lastBackupDate ? formatDateArabic(settings.lastBackupDate) : 'لم يتم التصدير بعد'}</strong>
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" style="font-size:0.86rem;">
              التنبيه بالنسخ الاحتياطي كل (بالأيام):
            </label>
            <div class="settings-inline-row">
              <input type="number" id="input-backup-reminder-days" class="form-input settings-input-compact" min="0" max="60" value="${settings.backupReminderDays ?? 7}" />
              <button class="btn btn-outline btn-sm" id="btn-save-backup-reminder">حفظ الفاصل</button>
              <span class="form-help">(0 لإيقاف التنبيه الدوري)</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. معايير الحضانة ومواعيد الدورة -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.settings}
          معايير الحضانة ومواعيد الدورة
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="responsive-two-col">
          <div class="form-group">
            <label class="form-label">
              مدة فحص التخصيب (بالأيام)
              <span class="form-label-required">*</span>
            </label>
            <input type="number" id="input-check-days" class="form-input" min="3" max="14" value="${settings.fertilityCheckDays}" />
            <span class="form-help">موعد كشف الجنين بالضوء (افتراضي 7).</span>
          </div>

          <div class="form-group">
            <label class="form-label">
              مدة حضن البيض للفقس (بالأيام)
              <span class="form-label-required">*</span>
            </label>
            <input type="number" id="input-incubation-days" class="form-input" min="14" max="25" value="${settings.incubationDays}" />
            <span class="form-help">مدة الحضانة حتى الفقس (افتراضي 18).</span>
          </div>
        </div>

        <div class="responsive-two-col">
          <div class="form-group">
            <label class="form-label">
              عمر جاهزية النقل والتجميع (بالأيام)
              <span class="form-label-required">*</span>
            </label>
            <input type="number" id="input-weaning-days" class="form-input" min="15" max="35" value="${settings.weaningAgeDays || 20}" />
            <span class="form-help">عمر فطام ونقل الزغلول (افتراضي 20).</span>
          </div>

          <div class="form-group">
            <label class="form-label">
              عمر البيع المستهدف (بالأيام)
              <span class="form-label-required">*</span>
            </label>
            <input type="number" id="input-target-sale-days" class="form-input" min="20" max="60" value="${settings.targetSaleAgeDays || 30}" />
            <span class="form-help">العمر المعتاد لبيع الزغاليل (افتراضي 30).</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">سبب التعديل (لتوثيقه بسجل الأحداث) <span class="form-label-required">*</span></label>
          <input type="text" id="input-settings-reason" class="form-input" placeholder="مثال: ضبط للموسم، اختلاف سلالة..." />
        </div>

        <button class="btn btn-primary btn-lg" id="btn-save-settings">
          ${icons.check} حفظ وتحديث معايير الدورة
        </button>
      </div>
    </div>

    <!-- 4. إدارة العلف واستهلاكه -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.grain}
          إدارة معدلات استهلاك العلف اليومية وتأريخها
        </div>
        <button class="btn btn-outline btn-sm" id="btn-add-rate-config">
          ${icons.plus}
          <span>إضافة معدل جديد</span>
        </button>
      </div>

      <div class="form-group" style="background-color:var(--surface-subtle);padding:12px;border-radius:var(--radius-md);margin-bottom:12px;">
        <label class="form-label" style="font-weight:bold;">نوع العلف الأساسي المستخدم للخصم التلقائي:</label>
        <div class="settings-inline-row">
          <select id="select-primary-feed" class="form-select settings-select-feed">
            <option value="">-- لم يتم تحديد نوع أساسي --</option>
            ${feedTypes
              .map(
                (f) =>
                  `<option value="${f.id}" ${f.id === settings.primaryFeedTypeId ? 'selected' : ''}>${f.name}</option>`
              )
              .join('')}
          </select>
          <button class="btn btn-primary btn-sm" id="btn-save-primary-feed">
            ${icons.check} حفظ كعلف أساسي
          </button>
        </div>
      </div>

      ${
        rateConfigs.length === 0
          ? `
        <div class="detail-empty-box">
          لا توجد معدلات استهلاك مسجلة حتى الآن.
        </div>
      `
          : `
        <div class="table-scroll-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>تاريخ السريان</th>
                <th>الفرد البالغ (جم/يوم)</th>
                <th>زغلول إنتاج (جم/يوم)</th>
                <th>زغلول تجميع (جم/يوم)</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              ${rateConfigs
                .map(
                  (rc) => `
                <tr>
                  <td style="font-weight:bold;">${formatDateArabic(rc.effectiveFromDate)}</td>
                  <td>${rc.adultGrams} جم</td>
                  <td>${rc.prodSquabGrams} جم</td>
                  <td>${rc.collSquabGrams} جم</td>
                  <td style="color:var(--text-muted);">${rc.note || '-'}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
      }
    </div>

    <!-- 5. تفضيلات التنبيهات -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.alert}
          تفضيلات التنبيهات ومهام اليوم
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;flex-direction:column;gap:8px;">
          <label class="form-checkbox" style="display:flex;align-items:center;gap:8px;font-size:0.88rem;cursor:pointer;">
            <input type="checkbox" id="pref-fertility" ${(settings.alertPreferences?.fertilityCheck ?? true) ? 'checked' : ''} />
            <span>تنبيهات فحص التخصيب المستحق (اليوم 5 إلى 7)</span>
          </label>

          <label class="form-checkbox" style="display:flex;align-items:center;gap:8px;font-size:0.88rem;cursor:pointer;">
            <input type="checkbox" id="pref-hatch" ${(settings.alertPreferences?.hatchExpected ?? true) ? 'checked' : ''} />
            <span>تنبيهات الفقس المتوقع للبيض المخصب (اليوم 18)</span>
          </label>

          <label class="form-checkbox" style="display:flex;align-items:center;gap:8px;font-size:0.88rem;cursor:pointer;">
            <input type="checkbox" id="pref-laying" ${(settings.alertPreferences?.eggLayingExpected ?? true) ? 'checked' : ''} />
            <span>تنبيهات وضع بيض متوقع للأزواج النشطة</span>
          </label>

          <label class="form-checkbox" style="display:flex;align-items:center;gap:8px;font-size:0.88rem;cursor:pointer;">
            <input type="checkbox" id="pref-transfer" ${(settings.alertPreferences?.readyForTransfer ?? true) ? 'checked' : ''} />
            <span>تنبيهات زغاليل جاهزة للنقل والتجميع (عمر 20+ يوماً)</span>
          </label>

          <label class="form-checkbox" style="display:flex;align-items:center;gap:8px;font-size:0.88rem;cursor:pointer;">
            <input type="checkbox" id="pref-sale" ${(settings.alertPreferences?.batchReadyForSale ?? true) ? 'checked' : ''} />
            <span>تنبيهات دفعات وزغاليل جاهزة للبيع (عمر 30+ يوماً)</span>
          </label>

          <label class="form-checkbox" style="display:flex;align-items:center;gap:8px;font-size:0.88rem;cursor:pointer;">
            <input type="checkbox" id="pref-low-feed" ${(settings.alertPreferences?.lowFeedStock ?? true) ? 'checked' : ''} />
            <span>تنبيهات انخفاض مخزون العلف عن حد الأمان</span>
          </label>
        </div>

        <button class="btn btn-primary btn-sm" id="btn-save-alert-prefs" style="align-self:flex-start;">
          ${icons.check} حفظ تفضيلات التنبيهات
        </button>
      </div>
    </div>

    <!-- 6. عتبات التقييم اللوني للأزواج -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.stats || ''}
          عتبات المؤشر اللوني لترتيب الأزواج
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        <div class="responsive-two-col">
          <div class="form-group">
            <label class="form-label">الحد الأدنى للمؤشر الأخضر (ممتاز) %</label>
            <input type="number" id="input-green-min" class="form-input" min="50" max="100" value="${settings.pairRankingThresholds?.greenMinRate ?? 80}" />
            <span class="form-help">افتراضي 80% فأكثر لكافة المعدلات.</span>
          </div>

          <div class="form-group">
            <label class="form-label">الحد الأدنى للمؤشر الأصفر (متوسط) %</label>
            <input type="number" id="input-yellow-min" class="form-input" min="30" max="90" value="${settings.pairRankingThresholds?.yellowMinRate ?? 60}" />
            <span class="form-help">أقل منه يظهر الزوج بالأحمر (افتراضي 60%).</span>
          </div>
        </div>

        <button class="btn btn-primary btn-sm" id="btn-save-thresholds" style="align-self:flex-start;">
          ${icons.check} حفظ عتبات التقييم
        </button>
      </div>
    </div>

    <!-- 7. حالة التخزين وتثبيت PWA -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.download}
          حالة التخزين المحلي وتثبيت التطبيق (PWA)
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;font-size:0.88rem;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px;">
          <span style="color:var(--text-secondary);">نوع التخزين:</span>
          <strong>محلي بالكامل (IndexedDB)</strong>
        </div>
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px;">
          <span style="color:var(--text-secondary);">قاعدة البيانات:</span>
          <strong dir="ltr">PigeonFarmDB (v4)</strong>
        </div>
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px;align-items:center;">
          <span style="color:var(--text-secondary);">حماية التخزين الدائم:</span>
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
            <span class="badge ${storagePersisted ? 'badge-success' : 'badge-warning'}">
              ${storagePersisted ? 'مفعّل ومحمي' : 'غير مفعّل'}
            </span>
            ${
              !storagePersisted
                ? `<button class="btn btn-outline btn-sm" id="btn-request-persist" style="font-size:0.86rem;padding:2px 8px;min-height:40px;">تفعيل الحماية</button>`
                : ''
            }
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px;">
          <span style="color:var(--text-secondary);">إجمالي الأحداث الموثقة:</span>
          <strong>${events.length} حدث مسجل</strong>
        </div>

        <div class="settings-pwa-actions">
          <button class="btn btn-primary btn-sm" id="btn-install-pwa-settings">
            ${icons.download} تثبيت التطبيق على الجهاز
          </button>
          <button class="btn btn-outline btn-sm" id="btn-pwa-guide">
            ${icons.info} دليل التثبيت (أندرويد وآيفون)
          </button>
        </div>
      </div>
    </div>

    <!-- 8. سجل تدقيق الأحداث الشامل (Event Log) -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          ${icons.history}
          سجل تدقيق أحداث المزرعة (Event Log)
        </div>
      </div>

      ${
        events.length === 0
          ? `
        <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.86rem;">
          لا توجد أحداث مسجلة بعد.
        </div>
      `
          : `
        <div class="timeline" style="margin-top:6px;">
          ${events
            .map(
              (evt) => `
            <div class="timeline-item">
              <div class="timeline-dot" style="width:30px;height:30px;">${icons.check}</div>
              <div class="timeline-content" style="padding:8px 12px;">
                <span class="timeline-time">${formatDateTimeArabic(evt.date)}</span>
                <span class="timeline-text" style="font-size:0.88rem;">${evt.note || evt.type}</span>
                ${
                  evt.oldValue || evt.newValue
                    ? `<div class="timeline-diff" style="font-size:0.86rem;">
                        ${evt.oldValue ? `<span style="color:var(--danger);margin-left:6px;">السابق: ${evt.oldValue}</span>` : ''}
                        ${evt.newValue ? `<span style="color:var(--success);">الجديد: ${evt.newValue}</span>` : ''}
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

    <!-- 9. منطقة الخطر والبيانات التجريبية -->
    <div class="card" style="border-color:#FCA5A5;background:#FFFBFB;">
      <div class="card-header">
        <div class="card-title" style="color:var(--danger);">
          ${icons.trash || ''}
          منطقة الخطر والبيانات التجريبية
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        <p style="font-size:0.86rem;color:var(--text-secondary);margin:0;">
          التطبيق يبدأ فارغاً تماماً. يمكنك تجربة التطبيق بتحميل بيانات تجريبية مع إمكانية حذفها كلها دفعة واحدة في أي وقت دون التأثير على بياناتك الحقيقية.
        </p>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="btn-load-demo-data" style="color:var(--primary);border-color:var(--primary);">
            تحميل بيانات تجريبية
          </button>
          <button class="btn btn-outline btn-sm" id="btn-delete-demo-data" style="color:#D97706;border-color:#D97706;">
            حذف البيانات التجريبية فقط
          </button>
          <button class="btn btn-danger btn-sm" id="btn-open-reset-feed-modal">
            ${icons.trash || ''} تصفير المخزون والعلف
          </button>
          <button class="btn btn-danger btn-sm" id="btn-open-wipe-modal">
            ${icons.trash || ''} مسح كافة البيانات نهائياً
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach event handlers
  container.querySelector('#btn-back-dashboard')?.addEventListener('click', () => navigate('dashboard'));
  container.querySelector('#btn-quick-search-header')?.addEventListener('click', () => showQuickSearchModal(navigate));

  // Open integrity check modal
  container.querySelector('#btn-open-integrity-modal')?.addEventListener('click', () => {
    showDataIntegrityModal(integrityReport, () => renderSettingsView(container, navigate), navigate);
  });

  // Run 13 scenarios automated test suite
  container.querySelector('#btn-run-tests')?.addEventListener('click', async () => {
    showToast('جاري تشغيل وفحص السيناريوهات الـ 13 الشاملة...', 'info');
    try {
      const { runComprehensivePhase6Tests } = await import('../tests/testPhase6');
      const results = await runComprehensivePhase6Tests();
      showTestSuiteModal(results);
      renderSettingsView(container, navigate);
    } catch (err: unknown) {
      showToast('حدث خطأ أثناء تشغيل الاختبارات: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  });

  // Export backup handler
  container.querySelector('#btn-export-backup')?.addEventListener('click', async () => {
    try {
      const backup = await exportBackupData();
      const json = JSON.stringify(backup, null, 2);
      const fileName = `pigeon_farm_backup_${getTodayDate()}.json`;
      triggerFileDownload(json, fileName);
      showToast('تم تصدير وتنزيل النسخة الاحتياطية بنجاح!', 'success');
      renderSettingsView(container, navigate);
    } catch (err: unknown) {
      showToast('فشل تصدير النسخة: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  });

  // Restore backup modal
  container.querySelector('#btn-restore-backup')?.addEventListener('click', () => {
    showRestoreBackupModal(() => renderSettingsView(container, navigate));
  });

  // Save backup reminder interval
  container.querySelector('#btn-save-backup-reminder')?.addEventListener('click', async () => {
    const input = container.querySelector('#input-backup-reminder-days') as HTMLInputElement;
    const days = parseInt(input?.value, 10);
    if (isNaN(days) || days < 0) {
      showToast('يرجى إدخال عدد أيام صحيح (0 فأكثر)', 'error');
      return;
    }
    try {
      await updateSettings(
        settings.incubationDays,
        settings.fertilityCheckDays,
        settings.weaningAgeDays,
        settings.targetSaleAgeDays,
        days,
        'تعديل فاصل التذكير بالنسخ الاحتياطي'
      );
      showToast('تم تحديث فاصل التذكير بالنسخ بنجاح', 'success');
      renderSettingsView(container, navigate);
    } catch (err: unknown) {
      showToast('فشل التحديث: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  });

  // Save cycle parameters
  container.querySelector('#btn-save-settings')?.addEventListener('click', async () => {
    const checkDays = parseInt((container.querySelector('#input-check-days') as HTMLInputElement)?.value, 10);
    const incubationDays = parseInt((container.querySelector('#input-incubation-days') as HTMLInputElement)?.value, 10);
    const weaningDays = parseInt((container.querySelector('#input-weaning-days') as HTMLInputElement)?.value, 10) || 20;
    const targetSaleDays = parseInt((container.querySelector('#input-target-sale-days') as HTMLInputElement)?.value, 10) || 30;
    const reason = (container.querySelector('#input-settings-reason') as HTMLInputElement)?.value.trim();

    if (isNaN(checkDays) || checkDays <= 0) {
      showToast('يرجى إدخال عدد أيام فحص تخصيب صحيح', 'error');
      return;
    }
    if (isNaN(incubationDays) || incubationDays <= 0) {
      showToast('يرجى إدخال عدد أيام حضن صحيح', 'error');
      return;
    }
    if (isNaN(weaningDays) || weaningDays <= 0) {
      showToast('يرجى إدخال عمر جاهزية نقل صحيح', 'error');
      return;
    }
    if (isNaN(targetSaleDays) || targetSaleDays <= 0) {
      showToast('يرجى إدخال عمر بيع مستهدف صحيح', 'error');
      return;
    }
    if (!reason) {
      showToast('يرجى كتابة سبب التعديل لتوثيقه في سجل الأحداث', 'error');
      (container.querySelector('#input-settings-reason') as HTMLInputElement)?.focus();
      return;
    }

    try {
      await updateSettings(
        incubationDays,
        checkDays,
        weaningDays,
        targetSaleDays,
        settings.backupReminderDays,
        reason
      );
      showToast('تم حفظ وتحديث الإعدادات بنجاح', 'success');
      renderSettingsView(container, navigate);
    } catch (err: unknown) {
      showToast('فشل حفظ الإعدادات: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  });

  // Add feed rate config
  container.querySelector('#btn-add-rate-config')?.addEventListener('click', () => {
    showAddFeedRateConfigModal(() => renderSettingsView(container, navigate));
  });

  // Save primary feed
  container.querySelector('#btn-save-primary-feed')?.addEventListener('click', async () => {
    const select = container.querySelector('#select-primary-feed') as HTMLSelectElement;
    const feedTypeId = select?.value;
    if (!feedTypeId) {
      showToast('يرجى تحديد نوع العلف أولاً', 'error');
      return;
    }
    try {
      await setPrimaryFeedType(feedTypeId, 'تحديد نوع العلف الأساسي من صفحة الإعدادات');
      showToast('تم تعيين وحفظ نوع العلف الأساسي بنجاح', 'success');
      renderSettingsView(container, navigate);
    } catch (err: unknown) {
      showToast('فشل الحفظ: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  });

  // Save alert preferences
  container.querySelector('#btn-save-alert-prefs')?.addEventListener('click', async () => {
    const prefs = {
      fertilityCheck: (container.querySelector('#pref-fertility') as HTMLInputElement)?.checked ?? true,
      hatchExpected: (container.querySelector('#pref-hatch') as HTMLInputElement)?.checked ?? true,
      eggLayingExpected: (container.querySelector('#pref-laying') as HTMLInputElement)?.checked ?? true,
      readyForTransfer: (container.querySelector('#pref-transfer') as HTMLInputElement)?.checked ?? true,
      batchReadyForSale: (container.querySelector('#pref-sale') as HTMLInputElement)?.checked ?? true,
      lowFeedStock: (container.querySelector('#pref-low-feed') as HTMLInputElement)?.checked ?? true,
    };
    try {
      await updateAlertPreferences(prefs);
      window.dispatchEvent(new Event('farm-data-updated'));
      showToast('تم حفظ تفضيلات التنبيهات بنجاح', 'success');
      renderSettingsView(container, navigate);
    } catch (err: unknown) {
      showToast('فشل الحفظ: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  });

  // Save thresholds
  container.querySelector('#btn-save-thresholds')?.addEventListener('click', async () => {
    const greenMin = parseInt((container.querySelector('#input-green-min') as HTMLInputElement)?.value, 10);
    const yellowMin = parseInt((container.querySelector('#input-yellow-min') as HTMLInputElement)?.value, 10);
    if (isNaN(greenMin) || isNaN(yellowMin) || greenMin <= yellowMin) {
      showToast('يجب أن تكون نسبة المؤشر الأخضر أكبر من نسبة المؤشر الأصفر', 'error');
      return;
    }
    try {
      await updatePairRankingThresholds({ greenMinRate: greenMin, yellowMinRate: yellowMin });
      showToast('تم حفظ عتبات التقييم اللوني بنجاح', 'success');
      renderSettingsView(container, navigate);
    } catch (err: unknown) {
      showToast('فشل الحفظ: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  });

  // Request storage persistence
  container.querySelector('#btn-request-persist')?.addEventListener('click', async () => {
    const granted = await requestStoragePersistence();
    if (granted) {
      showToast('تم تفعيل التخزين الدائم بنجاح لحماية بياناتك!', 'success');
    } else {
      showToast('لم يتمكن المتصفح من تفعيل التخزين الدائم تلقائياً.', 'info');
    }
    renderSettingsView(container, navigate);
  });

  // Direct PWA install button in Settings (moved from header)
  container.querySelector('#btn-install-pwa-settings')?.addEventListener('click', () => {
    const deferredPrompt = (window as any).deferredPWAInstallPrompt;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choice: any) => {
        if (choice.outcome === 'accepted') {
          showToast('تم قبول التثبيت!', 'success');
        }
        (window as any).deferredPWAInstallPrompt = null;
      });
    } else {
      showPWAInstallGuideModal();
    }
  });

  // PWA guide modal
  container.querySelector('#btn-pwa-guide')?.addEventListener('click', () => {
    showPWAInstallGuideModal();
  });

  // Load demo data
  container.querySelector('#btn-load-demo-data')?.addEventListener('click', async () => {
    try {
      await loadDemoData();
      showToast('تم تحميل البيانات التجريبية بنجاح وهي مميزة بعلامة "تجريبي"', 'success');
      renderSettingsView(container, navigate);
    } catch (err: unknown) {
      showToast('فشل تحميل البيانات التجريبية: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  });

  // Delete demo data
  container.querySelector('#btn-delete-demo-data')?.addEventListener('click', async () => {
    try {
      const res = await deleteDemoData();
      showToast(`تم حذف ${res.deletedCount} سجل تجريبي دون المساس بأي بيانات حقيقية`, 'info');
      renderSettingsView(container, navigate);
    } catch (err: unknown) {
      showToast('فشل حذف البيانات التجريبية: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  });

  // Reset feed & inventory only modal
  container.querySelector('#btn-open-reset-feed-modal')?.addEventListener('click', () => {
    showResetFeedInventoryModal(() => renderSettingsView(container, navigate));
  });

  // Wipe all data modal
  container.querySelector('#btn-open-wipe-modal')?.addEventListener('click', () => {
    showWipeAllDataModal(() => renderSettingsView(container, navigate));
  });
}
