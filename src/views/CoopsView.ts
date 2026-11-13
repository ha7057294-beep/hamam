import { getCoops, getPairs, getEggs, getSquabs } from '../db/indexedDB';
import { Coop } from '../types';
import { icons } from '../utils/icons';
import { showAddCoopModal } from '../components/Modal';
import { getSquabAge } from '../utils/dateUtils';

export async function renderCoopsView(
  container: HTMLElement,
  navigate: (view: string, params?: Record<string, string>) => void
) {
  const [coops, pairs, eggs, squabs] = await Promise.all([
    getCoops(),
    getPairs(),
    getEggs(),
    getSquabs(),
  ]);

  let currentFilter = 'all';

  function filterCoops(filter: string): Coop[] {
    switch (filter) {
      case 'active':
        return coops.filter((c) => c.active);
      case 'inactive':
        return coops.filter((c) => !c.active);
      case 'production':
        return coops.filter((c) => c.type === 'production');
      case 'collection':
        return coops.filter((c) => c.type === 'collection');
      default:
        return coops;
    }
  }

  function renderList() {
    const listContainer = container.querySelector('#coops-list-container');
    if (!listContainer) return;

    const filtered = filterCoops(currentFilter);

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="compact-empty-state">
          <div class="compact-empty-title">لا توجد سلاكات في هذا القسم</div>
          <div class="compact-empty-desc">
            ${coops.length === 0 ? 'ابدأ بإضافة أول سلاكة لمزرعتك.' : 'لا توجد سلاكات تطابق هذا الفلتر.'}
          </div>
          <button type="button" class="btn btn-primary btn-sm compact-empty-btn" id="btn-add-coop-empty">
            ${icons.plus} إضافة سلاكة
          </button>
        </div>
      `;
      listContainer.querySelector('#btn-add-coop-empty')?.addEventListener('click', () => {
        showAddCoopModal(() => renderCoopsView(container, navigate));
      });
      return;
    }

    listContainer.innerHTML = `
      <div class="compact-list">
        ${filtered
          .map((coop) => {
            const residentPair = pairs.find((p) => p.coopId === coop.id && p.status === 'active');
            const coopEggs = eggs.filter(
              (e) => e.coopId === coop.id && (e.status === 'pending' || e.status === 'fertile')
            );
            const coopSquabs = squabs.filter(
              (s) =>
                s.status === 'alive_production' &&
                (s.currentLocationId === coop.id || (!s.currentLocationId && s.originCoopId === coop.id))
            );
            const maxSquabAge =
              coopSquabs.length > 0 ? Math.max(...coopSquabs.map((s) => getSquabAge(s.hatchDate))) : 0;
            const hasSquabsReadyForTransfer = coopSquabs.length > 0 && maxSquabAge >= 20;

            const typeLabel = coop.type === 'production' ? 'إنتاج' : 'تجميع';
            const line1Text = `سلاكة ${coop.number} · ${typeLabel}${residentPair ? ` · ${residentPair.name}` : ''}`;

            const line2Parts: string[] = [];
            if (coopEggs.length > 0) {
              line2Parts.push(`بيض ${coopEggs.length}`);
            }
            if (coopSquabs.length > 0) {
              line2Parts.push(`زغلول ${coopSquabs.length} (أكبرهم ${maxSquabAge} يوم)`);
            }
            const line2Text =
              line2Parts.length > 0
                ? line2Parts.join(' · ')
                : coop.type === 'collection'
                ? 'سلاكة تجميع — اضغط لعرض الدفعات'
                : residentPair
                ? 'لا يوجد بيض أو زغاليل حالياً'
                : 'بدون زوج مسكّن';

            let actionBadgeHtml = '';
            if (!coop.active) {
              actionBadgeHtml = '<span class="badge badge-danger">متوقفة</span>';
            } else if (hasSquabsReadyForTransfer) {
              actionBadgeHtml = '<span class="badge badge-transfer">جاهز للنقل</span>';
            }

            return `
              <div class="list-card coop-card" data-coop-id="${coop.id}">
                <div class="list-card-main">
                  <div class="coop-num-box ${coop.active ? '' : 'coop-num-box-inactive'}">
                    ${coop.number}
                  </div>
                  <div class="list-card-lines">
                    <div class="list-card-line1">${line1Text}</div>
                    <div class="list-card-line2">${line2Text}</div>
                  </div>
                </div>
                ${
                  actionBadgeHtml
                    ? `<div class="list-card-badge-wrap">${actionBadgeHtml}</div>`
                    : ''
                }
              </div>
            `;
          })
          .join('')}
      </div>
    `;

    listContainer.querySelectorAll('.coop-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = (card as HTMLElement).dataset.coopId;
        if (id) navigate('coop_detail', { coopId: id });
      });
    });
  }

  const filterOptions = [
    { key: 'all', label: 'الكل' },
    { key: 'active', label: 'نشطة' },
    { key: 'production', label: 'إنتاج' },
    { key: 'collection', label: 'تجميع' },
    { key: 'inactive', label: 'متوقفة' },
  ];

  container.innerHTML = `
    <div class="list-view-header">
      <h1 class="list-view-title">السلاكات</h1>
      <button type="button" class="btn btn-primary btn-sm list-add-btn" id="btn-add-coop-top">
        ${icons.plus} إضافة
      </button>
    </div>

    <div class="filter-tabs">
      ${filterOptions
        .map((opt) => {
          const count = filterCoops(opt.key).length;
          const countClass = count === 0 ? 'filter-count-zero' : 'filter-count';
          return `<button type="button" class="filter-tab ${currentFilter === opt.key ? 'active' : ''}" data-filter="${opt.key}">${opt.label} <span class="${countClass}">(${count})</span></button>`;
        })
        .join('')}
    </div>

    <div id="coops-list-container"></div>
  `;

  renderList();

  container.querySelector('#btn-add-coop-top')?.addEventListener('click', () => {
    showAddCoopModal(() => renderCoopsView(container, navigate));
  });

  container.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = (tab as HTMLElement).dataset.filter || 'all';
      renderList();
    });
  });
}
