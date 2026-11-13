import 'fake-indexeddb/auto';
import {
  openDB,
  wipeAllData,
  addCoop,
  addPair,
  layEggs,
  getPairCurrentCycleEggs,
  getEggsByCycle,
  getCyclesForPair,
  updateEggLaidDate,
  deleteEgg,
  checkEggFertility,
  recordEggHatch,
  getTodayTasks,
  snoozeTask,
  getAllEvents,
  getSettings,
} from '../db/indexedDB';
import { getTodayDate, addDays, getEggSchedule } from '../utils/dateUtils';

function assert(condition: unknown, msg: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

async function expectThrows(fn: () => Promise<unknown>, msg: string) {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  assert(threw, msg);
}

async function runEggActionTests() {
  console.log('--- STARTING EGG ACTIONS & 2ND EGG FIX TESTS ---');
  await openDB();
  await wipeAllData();

  const today = getTodayDate();
  const tomorrow = addDays(today, 1);
  const settings = await getSettings();

  const coop = await addCoop({ number: 'E-1', type: 'production' });
  const pair = await addPair({
    name: 'زوج الاختبار',
    coopId: coop.id,
    breed: 'بلدي',
    maleInfo: 'ذكر 1',
    femaleInfo: 'أنثى 1',
    pairedDate: addDays(today, -30),
  });

  // 1. منع تسجيل تاريخ وضع في المستقبل
  console.log('1. اختبار منع تسجيل تاريخ وضع في المستقبل...');
  await expectThrows(
    () =>
      layEggs({
        pairId: pair.id,
        coopId: coop.id,
        egg1Date: tomorrow,
      }),
    'يجب رفض تسجيل البيضة الأولى بتاريخ مستقبلي'
  );

  await expectThrows(
    () =>
      layEggs({
        pairId: pair.id,
        coopId: coop.id,
        egg1Date: today,
        egg2Date: tomorrow,
      }),
    'يجب رفض تسجيل البيضة الثانية بتاريخ مستقبلي'
  );

  // 2. تسجيل البيضة الأولى ثم الثانية بشكل منفصل في نفس الدورة
  console.log('2. اختبار تسجيل البيضة الأولى ثم الثانية ثم منع الثالثة...');
  let cycleState = await getPairCurrentCycleEggs(pair.id);
  assert(cycleState.eggs.length === 0, 'العش يجب أن يكون فارغاً في البداية');

  const laid1 = await layEggs({
    pairId: pair.id,
    coopId: coop.id,
    egg1Date: addDays(today, -2),
  });
  assert(laid1.length === 1 && laid1[0].eggNumber === 1, 'البيضة الأولى يجب أن تأخذ رقم 1');

  cycleState = await getPairCurrentCycleEggs(pair.id);
  assert(cycleState.eggs.length === 1 && cycleState.eggs[0].eggNumber === 1, 'يجب أن يظهر بالعش بيضة واحدة رقم 1');

  // إضافة البيضة الثانية فقط في نفس الدورة
  const laid2 = await layEggs({
    pairId: pair.id,
    coopId: coop.id,
    egg1Date: today,
  });
  assert(laid2.length === 1 && laid2[0].eggNumber === 2, 'البيضة الثانية يجب أن تأخذ رقم 2');
  assert(laid2[0].cycleId === laid1[0].cycleId, 'البيضة الثانية يجب أن ترتبط بنفس الدورة');

  const cycleEggs = await getEggsByCycle(laid1[0].cycleId);
  assert(cycleEggs.length === 2, 'يجب أن تحتوي الدورة على بيضتين فقط');

  cycleState = await getPairCurrentCycleEggs(pair.id);
  assert(cycleState.eggs.length === 2, 'getPairCurrentCycleEggs يجب أن يرجع بيضتين للعش المكتمل');

  // منع تسجيل بيضة ثالثة في نفس الدورة
  await expectThrows(
    () =>
      layEggs({
        pairId: pair.id,
        coopId: coop.id,
        egg1Date: today,
      }),
    'يجب منع إضافة بيضة ثالثة عندما يكتمل العش ببيضتين'
  );

  // 3. حذف البيضة الأولى يبقي الثانية، وتسجيل بيضة ناقصة يعطيها رقم 1
  console.log('3. اختبار حذف البيضة الأولى وإعادة تسجيلها برقم 1...');
  const delFirstRes = await deleteEgg(laid1[0].id, 'حذف البيضة الأولى للتجربة');
  assert(!delFirstRes.deletedCycle, 'لا يجب حذف الدورة لوجود البيضة الثانية');

  cycleState = await getPairCurrentCycleEggs(pair.id);
  assert(
    cycleState.eggs.length === 1 && cycleState.eggs[0].eggNumber === 2,
    'المتبقي في العش يجب أن يكون البيضة رقم 2 فقط'
  );

  const reAddedFirst = await layEggs({
    pairId: pair.id,
    coopId: coop.id,
    egg1Date: addDays(today, -1),
  });
  assert(
    reAddedFirst.length === 1 && reAddedFirst[0].eggNumber === 1,
    'عند وجود البيضة رقم 2 فقط، البيضة الجديدة الناقصة يجب أن تأخذ رقم 1'
  );

  // 4. تعديل تاريخ الوضع + إعادة حساب المواعيد والتنبيهات + توثيق oldValue/newValue
  console.log('4. اختبار تعديل تاريخ الوضع وإعادة حساب المواعيد والتنبيهات...');
  const targetEgg = reAddedFirst[0];
  const oldLaidDate = targetEgg.laidDate;
  const eightDaysAgo = addDays(today, -8);

  await expectThrows(
    () => updateEggLaidDate(targetEgg.id, tomorrow),
    'يجب رفض تعديل تاريخ الوضع إلى المستقبل'
  );

  const updatedEgg = await updateEggLaidDate(targetEgg.id, eightDaysAgo, 'تصحيح التاريخ');
  assert(updatedEgg.laidDate === eightDaysAgo, 'يجب تحديث تاريخ الوضع');

  const newSchedule = getEggSchedule(updatedEgg, settings);
  assert(
    newSchedule.expectedCheckDate === addDays(eightDaysAgo, settings.fertilityCheckDays),
    'يجب إعادة حساب موعد الفحص من تاريخ الوضع الجديد'
  );
  assert(
    newSchedule.expectedHatchDate === addDays(eightDaysAgo, settings.incubationDays),
    'يجب إعادة حساب موعد الفقس من تاريخ الوضع الجديد'
  );

  let tasks = await getTodayTasks();
  assert(
    tasks.some((t) => t.id === `task_check_${updatedEgg.id}`),
    'بعد تعديل التاريخ لما قبل مدة الفحص يجب أن يظهر تنبيه فحص التخصيب'
  );

  // تأجيل المهمة ثم تعديل التاريخ لليوم -> يجب مسح التأجيل وإزالة المهمة المستحقة
  await snoozeTask(`task_check_${updatedEgg.id}`, tomorrow);
  await updateEggLaidDate(updatedEgg.id, today);
  tasks = await getTodayTasks();
  assert(
    !tasks.some((t) => t.id === `task_check_${updatedEgg.id}`),
    'بعد تعديل التاريخ لليوم لا يجب أن تكون مهمة فحص التخصيب مستحقة'
  );

  // 5. منع حذف بيضة فقست
  console.log('5. اختبار منع حذف البيضة التي فقست...');
  await checkEggFertility(laid2[0].id, true, today);
  await recordEggHatch(laid2[0].id, today);
  await expectThrows(
    () => deleteEgg(laid2[0].id),
    'يجب منع حذف البيضة الفاقسة لأنها مرتبطة بزغلول'
  );

  // 6. حذف آخر بيضة في دورة مستقلة يحذف الدورة الفارغة ويحتفظ بسجل الأحداث
  console.log('6. اختبار حذف آخر بيضة وحذف الدورة الفارغة مع الحفاظ على سجل الأحداث...');
  const pair2 = await addPair({
    name: 'زوج العش الوحيد',
    coopId: coop.id,
    breed: 'زاجل',
    maleInfo: 'ذكر 2',
    femaleInfo: 'أنثى 2',
    pairedDate: addDays(today, -15),
  });
  const soloEggs = await layEggs({
    pairId: pair2.id,
    coopId: coop.id,
    egg1Date: today,
  });
  const soloCycleId = soloEggs[0].cycleId;
  const delLastRes = await deleteEgg(soloEggs[0].id, 'اتسجلت بالغلط');
  assert(delLastRes.deletedCycle === true, 'عند حذف آخر بيضة في الدورة يجب حذف الدورة الفارغة');

  const pair2Cycles = await getCyclesForPair(pair2.id);
  assert(pair2Cycles.length === 0, 'الدورة الفارغة يجب أن تكون محذوفة من جدول الدورات');

  const allEvents = await getAllEvents();
  const editEvents = allEvents.filter(
    (e) => e.entityId === targetEgg.id && e.type === 'edit_egg_laid_date'
  );
  assert(
    editEvents.some((e) => e.oldValue === oldLaidDate && e.newValue === eightDaysAgo),
    'حدث تعديل تاريخ الوضع يجب أن يسجل oldValue و newValue'
  );

  const deleteEggEvent = allEvents.find(
    (e) => e.entityId === soloEggs[0].id && e.type === 'delete_egg'
  );
  assert(
    deleteEggEvent && Boolean(deleteEggEvent.oldValue) && deleteEggEvent.newValue === null,
    'حدث حذف البيضة يجب أن يبقى في events ويسجل oldValue و newValue'
  );

  const deleteCycleEvent = allEvents.find(
    (e) => e.entityId === soloCycleId && e.type === 'delete_empty_cycle'
  );
  assert(
    deleteCycleEvent && Boolean(deleteCycleEvent.oldValue) && deleteCycleEvent.newValue === null,
    'حدث حذف الدورة الفارغة يجب أن يبقى في events ويسجل oldValue و newValue'
  );

  console.log('✓ ALL EGG ACTIONS & 2ND EGG TESTS PASSED SUCCESSFULLY!');
}

runEggActionTests().catch((err) => {
  console.error('❌ EGG ACTION TEST FAILED:', err);
  process.exit(1);
});
