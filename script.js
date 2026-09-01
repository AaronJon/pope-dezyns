const gallery = document.getElementById('gallery');
const filtersEl = document.getElementById('filters');
const emptyState = document.getElementById('emptyState');

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxCaption = document.getElementById('lightboxCaption');

let ALL_WORKS = [];
let currentList = [];
let currentIndex = 0;

async function loadWorks() {
  try {
    const res = await fetch('works.json', { cache: 'no-store' });
    ALL_WORKS = res.ok ? await res.json() : [];
  } catch (err) {
    ALL_WORKS = [];
  }
  renderFilters();
  renderGallery(ALL_WORKS);
}

function renderFilters() {
  if (ALL_WORKS.length === 0) { filtersEl.innerHTML = ''; return; }
  const categories = ['All', ...new Set(ALL_WORKS.map(w => w.category).filter(Boolean))];
  filtersEl.innerHTML = '';
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.textContent = cat;
    if (cat === 'All') btn.classList.add('active');
    btn.addEventListener('click', () => {
      filtersEl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGallery(cat === 'All' ? ALL_WORKS : ALL_WORKS.filter(w => w.category === cat));
    });
    filtersEl.appendChild(btn);
  });
}

function renderGallery(list) {
  currentList = list;
  gallery.innerHTML = '';
  emptyState.hidden = list.length > 0;

  list.forEach((work, i) => {
    const fig = document.createElement('figure');
    fig.className = 'piece';
    fig.tabIndex = 0;
    fig.innerHTML = `
      <img src="${work.src}" alt="${work.title || ''}" loading="lazy">
      <figcaption class="piece-label">
        ${work.title || ''}
        ${work.category ? `<span class="category">${work.category}</span>` : ''}
      </figcaption>
    `;
    fig.addEventListener('click', () => openLightbox(i));
    fig.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') openLightbox(i);
    });
    gallery.appendChild(fig);
  });
}

function openLightbox(index) {
  currentIndex = index;
  updateLightbox();
  lightbox.hidden = false;
}

function updateLightbox() {
  const work = currentList[currentIndex];
  lightboxImg.src = work.src;
  lightboxImg.alt = work.title || '';
  lightboxCaption.textContent = [work.title, work.category].filter(Boolean).join(' — ');
}

function closeLightbox() { lightbox.hidden = true; }

document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightboxPrev').addEventListener('click', () => {
  currentIndex = (currentIndex - 1 + currentList.length) % currentList.length;
  updateLightbox();
});
document.getElementById('lightboxNext').addEventListener('click', () => {
  currentIndex = (currentIndex + 1) % currentList.length;
  updateLightbox();
});
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') document.getElementById('lightboxPrev').click();
  if (e.key === 'ArrowRight') document.getElementById('lightboxNext').click();
});

loadWorks();
