import { getPairs, getCoops, getEggs, getSquabs } from '../db/indexedDB';
import { Pair } from '../types';
import { icons } from '../utils/icons';
import { showAddPairModal } from '../components/Modal';

export async function renderPairsView(
  container: HTMLElement,
  navigate: (view: string, params?: Record<string, string>) => void
) {
  const [pairs, coops, eggs, squabs] = await Promise.all([
    getPairs(),
    getCoops(),
    getEggs(),
    getSquabs(),
  ]);

  let currentFilter = 'all';

  function filterPairs(filter: string): Pair[] {
    switch (filter) {
      case 'active':
        return pairs.filter((p) => p.status === 'active');
      case 'inactive':
        return pairs.filter((p) => p.status === 'inactive');
      default:
        return pairs;
    }
  }

  function renderList() {
    const listContainer = container.querySelector('#pairs-list-container');
    if (!listContainer) return;

    const filtered = filterPairs(currentFilter);

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="compact-empty-state">
          <div class="compact-empty-title">لا توجد أزواج في هذا القسم</div>
          <div class="compact-empty-desc">
            ${pairs.length === 0 ? 'ابدأ بإضافة أول زوج حمام وحدد سلاكته.' : 'لا توجد أزواج تطابق هذا الفلتر.'}
          </div>
          <button type="button" class="btn btn-primary btn-sm compact-empty-btn" id="btn-add-pair-empty">
            ${icons.plus} إضافة زوج
          </button>
        </div>
      `;
      listContainer.querySelector('#btn-add-pair-empty')?.addEventListener('click', () => {
        showAddPairModal(null, () => renderPairsView(container, navigate));
      });
      return;
    }

    listContainer.innerHTML = `
      <div class="compact-list">
        ${filtered
          .map((pair) => {
            const coop = coops.find((c) => c.id === pair.coopId);
            const pairEggsCount = eggs.filter((e) => e.pairId === pair.id).length;
            const pairSquabsCount = squabs.filter((s) => s.pairId === pair.id).length;

            const line1Parts = [pair.name];
            if (pair.breed) line1Parts.push(pair.breed);
            line1Parts.push(coop ? `سلاكة ${coop.number}` : 'بدون سلاكة');

            return `
              <div class="list-card pair-card" data-pair-id="${pair.id}">
                <div class="list-card-main">
                  <div class="list-card-lines">
                    <div class="list-card-line1">${line1Parts.join(' · ')}</div>
                    <div class="list-card-line2">بيض ${pairEggsCount} · زغاليل ${pairSquabsCount}</div>
                  </div>
                </div>
                ${
                  pair.status === 'inactive'
                    ? '<div class="list-card-badge-wrap"><span class="badge badge-danger">متوقف</span></div>'
                    : ''
                }
              </div>
            `;
          })
          .join('')}
      </div>
    `;

    listContainer.querySelectorAll('.pair-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = (card as HTMLElement).dataset.pairId;
        if (id) navigate('pair_detail', { pairId: id });
      });
    });
  }

  container.innerHTML = `
    <div class="list-view-header">
      <h1 class="list-view-title">الأزواج (${pairs.length})</h1>
      <button type="button" class="btn btn-primary btn-sm list-add-btn" id="btn-add-pair-top">
        ${icons.plus} إضافة
      </button>
    </div>

    <div class="filter-tabs">
      <button type="button" class="filter-tab active" data-filter="all">الكل</button>
      <button type="button" class="filter-tab" data-filter="active">نشطة</button>
      <button type="button" class="filter-tab" data-filter="inactive">متوقفة</button>
    </div>

    <div id="pairs-list-container"></div>
  `;

  renderList();

  container.querySelector('#btn-add-pair-top')?.addEventListener('click', () => {
    showAddPairModal(null, () => renderPairsView(container, navigate));
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
