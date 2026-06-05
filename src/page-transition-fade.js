let washEl = null;
let pendingUrl = null;
let navigateTimer = null;
let isAnimating = false;

const FADE_IN_DURATION = 600;        
const FADE_OUT_DURATION = 400;       
const HOLD_BEFORE_NAVIGATE = 100;    

// ▸ Создаём или получаем оверлей
function getOrCreateWash() {
  if (washEl) return washEl;

  washEl = document.createElement('div');
  washEl.id = 'page-wash';
  washEl.setAttribute('aria-hidden', 'true');

  const bg = document.createElement('div');
  bg.className = 'page-wash__bg';

  washEl.appendChild(bg);
  document.documentElement.appendChild(washEl);

  return washEl;
}

// ▸ Удаляем оверлей
function destroyWash() {
  if (washEl) {
    washEl.remove();
    washEl = null;
  }
  if (navigateTimer) clearTimeout(navigateTimer);
}

// ▸ Показываем оверлей (затемнение) и запускаем переход
function showWash(url) {
  if (isAnimating) return;
  isAnimating = true;
  pendingUrl = url;

  getOrCreateWash();

  // Сбрасываем возможные классы и форсируем reflow
  washEl.classList.remove('page-wash--active', 'page-wash--exit');
  void washEl.offsetWidth;

  // Запускаем плавное появление (transition задан в CSS)
  requestAnimationFrame(() => {
    washEl.classList.add('page-wash--active');
  });

  // Ждём, пока затемнение завершится, и переходим
  navigateTimer = setTimeout(() => {
    if (pendingUrl) {
      performNavigation(pendingUrl);
    }
  }, FADE_IN_DURATION + HOLD_BEFORE_NAVIGATE);
}

// ▸ Переход на новую страницу
function performNavigation(url) {
  pendingUrl = null;
  // Минимальная задержка для гарантии отрисовки последнего кадра
  setTimeout(() => {
    window.location.href = url;
  }, 20);
}

// ▸ Экстренное скрытие (если что-то пошло не так)
function emergencyHide() {
  isAnimating = false;
  pendingUrl = null;
  if (washEl) {
    washEl.classList.remove('page-wash--active');
    washEl.classList.add('page-wash--exit');
    setTimeout(destroyWash, 650);
  }
}

// Вспомогательные проверки (как в оригинале)
function isInternalLink(href) {
  if (!href) return false;
  if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
  try {
    const url = new URL(href, location.origin);
    return url.origin === location.origin;
  } catch {
    return false;
  }
}

function isSamePageAnchor(href) {
  try {
    const url = new URL(href, location.origin);
    return url.origin === location.origin && url.pathname === location.pathname && url.hash.length > 0;
  } catch {
    return false;
  }
}

// Плавный скролл для якорей (как у вас)
const _easeInOutQuint = (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

function handleSamePageAnchor(e, href) {
  const url = new URL(href, location.origin);
  const hash = url.hash;
  if (!hash || !document.querySelector(hash)) return false;
  e.preventDefault();
  const target = document.querySelector(hash);
  const y = target.getBoundingClientRect().top + window.scrollY;
  if (typeof window.__lenis !== 'undefined' && window.__lenis) {
    window.__lenis.scrollTo(y, { easing: _easeInOutQuint, duration: 1.6 });
  } else {
    const startY = window.scrollY;
    const distance = y - startY;
    if (distance === 0) return true;
    const duration = Math.min(Math.max(Math.abs(distance) / 2000, 0.5), 2.0) * 1000;
    const startTime = performance.now();
    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = _easeInOutQuint(progress);
      window.scrollTo(0, startY + distance * eased);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  return true;
}

// ▸ Главная функция инициализации
export function initPageTransitionFade() {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href) return;
    if (link.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

    if (isSamePageAnchor(href)) {
      handleSamePageAnchor(e, href);
      return;
    }

    if (href === '/' || href === '') {
      if (location.pathname === '/' || location.pathname === '/index.html') {
        e.preventDefault();
        const startY = window.scrollY;
        if (startY === 0) return;
        if (typeof window.__lenis !== 'undefined' && window.__lenis) {
          window.__lenis.scrollTo(0, { easing: _easeInOutQuint, duration: 1.6 });
        } else {
          const distance = -startY;
          const duration = Math.min(Math.max(Math.abs(startY) / 2000, 0.5), 2.0) * 1000;
          const startTime = performance.now();
          function step(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = _easeInOutQuint(progress);
            window.scrollTo(0, startY + distance * eased);
            if (progress < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        }
        return;
      }
    }

    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (!isInternalLink(href)) return;

    if (reducedMotion) return;

    const navPanel = link.closest('.nav__links');
    if (navPanel && navPanel.classList.contains('open')) {
      if (typeof window.__closeMobileMenu === 'function') {
        window.__closeMobileMenu();
      }
    }

    e.preventDefault();
    showWash(href);
  });

  // На новой странице просто подчищаем оверлей, если он остался
  window.addEventListener('pageshow', () => {
    emergencyHide();
    isAnimating = false;
  });

  window.addEventListener('pagehide', () => {
    destroyWash();
  });
}