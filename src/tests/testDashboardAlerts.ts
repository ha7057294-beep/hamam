import 'fake-indexeddb/auto';
import {
  openDB,
  wipeAllData,
  addCoop,
  addPair,
  layEggs,
  checkEggFertility,
  recordEggHatch,
  addFeedType,
  recordFeedPurchase,
  recordStockManualAdjustment,
  getTodayTasks,
  completeTask,
  exportBackupData,
  calculateFinancialResults,
  addManualRevenue,
  addExpense,
  updateSettings,
} from '../db/indexedDB';
import { getTodayDate, addDays, getFirstDayOfMonth } from '../utils/dateUtils';

function assert(condition: unknown, msg: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

async function runAlertAndDashboardTests() {
  console.log('--- STARTING DASHBOARD & ALERTS REGRESSION TESTS ---');
  await openDB();
  await wipeAllData();
  const today = getTodayDate();

  // 1. Test egg_laying_expected: cycle-scoped key returns on new cycle after "تم"
  console.log('1. اختبار تجدد تنبيه وضع البيض المتوقع مع الدورة الجديدة...');
  const coop1 = await addCoop({ number: 'A-1', type: 'production' });
  const pair1 = await addPair({
    name: 'زوج A-1',
    coopId: coop1.id,
    breed: 'بلدي',
    maleInfo: 'ذكر 1',
    femaleInfo: 'أنثى 1',
    pairedDate: addDays(today, -60),
  });

  // Lay clutch 1, 22 days ago, and mark infertile so no active eggs remain
  const c1Eggs = await layEggs({
    pairId: pair1.id,
    coopId: coop1.id,
    egg1Date: addDays(today, -22),
  });
  for (const egg of c1Eggs) {
    await checkEggFertility(egg.id, false, addDays(today, -15));
  }

  let tasks = await getTodayTasks();
  const layTask1 = tasks.find((t) => t.type === 'egg_laying_expected' && t.pairId === pair1.id);
  assert(layTask1, 'يجب ظهور تنبيه وضع بيض متوقع للدورة الأولى');
  assert(
    layTask1!.id.includes(c1Eggs[0].cycleId),
    'يجب أن يتضمن معرف التنبيه رقم الدورة الأولى'
  );

  // Mark done ("تم")
  await completeTask(layTask1!.id);
  tasks = await getTodayTasks();
  assert(
    !tasks.some((t) => t.type === 'egg_laying_expected' && t.pairId === pair1.id),
    'يجب اختفاء التنبيه بعد الضغط على تم'
  );

  // New cycle starts (21 days ago) and closes out -> new alert must reappear!
  const c2Eggs = await layEggs({
    pairId: pair1.id,
    coopId: coop1.id,
    egg1Date: addDays(today, -21),
  });
  for (const egg of c2Eggs) {
    await checkEggFertility(egg.id, false, addDays(today, -14));
  }

  tasks = await getTodayTasks();
  const layTask2 = tasks.find((t) => t.type === 'egg_laying_expected' && t.pairId === pair1.id);
  assert(layTask2, 'يجب عودة تنبيه وضع بيض متوقع عند بدء دورة جديدة');
  assert(layTask2!.id !== layTask1!.id, 'يجب أن يختلف معرف التنبيه للدورة الجديدة');
  console.log('✓ نجح: تنبيه وضع البيض يعود في الدورة الجديدة بعد "تم".');

  // 2. Test ready_for_transfer: grouped by coop, hides group on "تم", reappears when a new squab reaches 20 days
  console.log('2. اختبار تجميع تنبيه الجاهزية للنقل حسب السلاكة...');
  const c3Eggs = await layEggs({
    pairId: pair1.id,
    coopId: coop1.id,
    egg1Date: addDays(today, -40),
    egg2Date: addDays(today, -39),
  });
  await checkEggFertility(c3Eggs[0].id, true, addDays(today, -33));
  await checkEggFertility(c3Eggs[1].id, true, addDays(today, -33));
  const sq1 = await recordEggHatch(c3Eggs[0].id, addDays(today, -22));
  const sq2 = await recordEggHatch(c3Eggs[1].id, addDays(today, -21));

  tasks = await getTodayTasks();
  const transferTasksCoop1 = tasks.filter(
    (t) => t.type === 'ready_for_transfer' && t.coopId === coop1.id
  );
  assert(
    transferTasksCoop1.length === 1,
    `المتوقع تنبيه واحد مجمّع للسلاكة A-1 ولكن ظهر ${transferTasksCoop1.length}`
  );
  assert(
    transferTasksCoop1[0].title.includes('2'),
    'يجب أن يعرض عنوان التنبيه المجمّع عدد 2 زغلول'
  );

  // Mark group done
  await completeTask(transferTasksCoop1[0].id);
  tasks = await getTodayTasks();
  assert(
    !tasks.some((t) => t.type === 'ready_for_transfer' && t.coopId === coop1.id),
    'يجب اختفاء تنبيه المجموعة بعد تم'
  );

  // Another squab in same coop becomes ready (age 20)
  const c4Eggs = await layEggs({
    pairId: pair1.id,
    coopId: coop1.id,
    egg1Date: addDays(today, -38),
  });
  await checkEggFertility(c4Eggs[0].id, true, addDays(today, -31));
  const sq3 = await recordEggHatch(c4Eggs[0].id, addDays(today, -20));
  assert(sq1 && sq2 && sq3, 'تم إنشاء الزغاليل');

  tasks = await getTodayTasks();
  const transferTasksAfterSq3 = tasks.filter(
    (t) => t.type === 'ready_for_transfer' && t.coopId === coop1.id
  );
  assert(
    transferTasksAfterSq3.length === 1,
    'يجب عودة تنبيه مجمّع جديد عند جاهزية زغلول جديد في نفس السلاكة'
  );
  console.log('✓ نجح: تجميع تنبيه النقل بالسلاكة وعودته عند ظهور زغلول جديد.');

  // 3. Test low_feed_stock: returns after purchase/manual adjustment + dropping below threshold again
  console.log('3. اختبار تجدد تنبيه انخفاض المخزون بعد الشراء أو التعديل اليدوي...');
  const feed = await addFeedType({ name: 'علف بياض', alertThresholdKg: 20 });
  await recordFeedPurchase({ feedTypeId: feed.id, quantityKg: 10, unitPrice: 15, date: today });

  tasks = await getTodayTasks();
  const lowTask1 = tasks.find((t) => t.type === 'low_feed_stock' && t.feedTypeId === feed.id);
  assert(lowTask1, 'يجب ظهور تنبيه انخفاض المخزون');

  await completeTask(lowTask1!.id);
  tasks = await getTodayTasks();
  assert(
    !tasks.some((t) => t.type === 'low_feed_stock' && t.feedTypeId === feed.id),
    'يجب اختفاء تنبيه المخزون بعد تم'
  );

  // Purchase stock above threshold, then adjust down below threshold
  await recordFeedPurchase({ feedTypeId: feed.id, quantityKg: 30, unitPrice: 15, date: today });
  await recordStockManualAdjustment({
    feedTypeId: feed.id,
    quantityDeltaKg: -25,
    reason: 'تسوية جرد اختبارية',
    date: today,
  });

  tasks = await getTodayTasks();
  const lowTask2 = tasks.find((t) => t.type === 'low_feed_stock' && t.feedTypeId === feed.id);
  assert(lowTask2, 'يجب عودة تنبيه انخفاض المخزون بعد حركة شراء/تعديل جديدة ونقص الرصيد');
  assert(lowTask2!.id !== lowTask1!.id, 'يجب أن يتغير معرف التنبيه بعد الحركة الجديدة');
  console.log('✓ نجح: تنبيه انخفاض المخزون يتجدد بعد أي حركة شراء أو تعديل.');

  // 4. Test backup_reminder: last in sorted list + returns after lastBackupDate cycle changes
  console.log('4. اختبار تذكير النسخ الاحتياطي في آخر القائمة وتجدده بعد النسخ...');
  await updateSettings(18, 7, 20, 30, 7, 'تفعيل تذكير النسخ للاختبار');
  tasks = await getTodayTasks();
  const backupTask1 = tasks.find((t) => t.type === 'backup_reminder');
  assert(backupTask1, 'يجب ظهور تذكير النسخ الاحتياطي');
  assert(
    tasks[tasks.length - 1].type === 'backup_reminder',
    'يجب أن يكون تذكير النسخ الاحتياطي في آخر القائمة دائماً'
  );

  await completeTask(backupTask1!.id);
  tasks = await getTodayTasks();
  assert(!tasks.some((t) => t.type === 'backup_reminder'), 'يجب اختفاء تذكير النسخ بعد تم');

  // Export backup (sets lastBackupDate = today), so when overdue later key changes
  await exportBackupData();
  // Simulate an older lastBackupDate (10 days ago) directly to verify key change brings reminder back
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const getReq = store.get('global_settings');
    getReq.onsuccess = () => {
      const s = getReq.result;
      s.lastBackupDate = addDays(today, -10);
      store.put(s);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  tasks = await getTodayTasks();
  const backupTask2 = tasks.find((t) => t.type === 'backup_reminder');
  assert(backupTask2, 'يجب عودة تذكير النسخ الاحتياطي عند مرور المدة بعد آخر نسخة احتياطية');
  assert(backupTask2!.id !== backupTask1!.id, 'يجب تغير معرف تذكير النسخ الاحتياطي بتغير التاريخ');
  console.log('✓ نجح: تذكير النسخ في آخر القائمة ويتجدد عند تغير تاريخ آخر نسخة.');

  // 5. Test current month profit KPI matches calculateFinancialResults
  console.log('5. اختبار حساب ربح الشهر الحالي...');
  await addManualRevenue({
    date: today,
    amount: 500,
    category: 'other',
    description: 'إيراد اختباري للشهر',
  });
  await addExpense({
    date: today,
    amount: 120,
    category: 'utilities',
    accountingType: 'operational',
    description: 'مصروف اختباري للشهر',
  });
  const monthFin = await calculateFinancialResults(getFirstDayOfMonth(), today);
  assert(
    monthFin.netOperatingProfit === 500 - 150 - 450 - 120,
    `صافي ربح الشهر المحسوب: ${monthFin.netOperatingProfit}`
  );
  console.log(`✓ نجح: حساب ربح الشهر الحالي من calculateFinancialResults (${monthFin.netOperatingProfit} ج.م).`);

  console.log('--- ALL DASHBOARD & ALERTS REGRESSION TESTS PASSED! ---');
}

runAlertAndDashboardTests().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
