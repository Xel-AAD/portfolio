/* ============================================================
   SCROLL.JS — Анимации при скролле + поведение хедера
   
   Три функции:
   1. initScrollAnimations — IntersectionObserver для .anim-fade-up:
      элемент появляется когда входит в видимую зону.
   2. initHeaderScroll — хедер: .scrolled при скролле,
      скрытие на портфолио, подсветка активной ссылки.
   3. initHeroAnimations — мгновенное появление hero-элементов
      через 200мс (без ожидания скролла).
   ============================================================ */
import { $, $$ } from './dom.js'

/* --- IntersectionObserver для .anim-fade-up ---
   Следит за элементами с классом .anim-fade-up.
   Когда элемент входит в видимую зону — добавляет .visible,
   и CSS-transition плавно проявляет его (opacity 0→1, translateY 20→0).
   После появления — перестаёт следить (unobserve), чтобы не повторялось. */
const _scrollObserver = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        _scrollObserver.unobserve(entry.target) /* Один раз — появился и всё */
      }
    })
  },
  {
    threshold: 0.1,                          /* 10% элемента видно = триггер */
    rootMargin: '0px 0px -40px 0px'         /* Сдвиг нижней границы на 40px вверх — элемент появляется чуть позже */
  }
)

/* Регистрирует все .anim-fade-up элементы, которые ещё не .visible.
   Вызывается при загрузке страницы и после смены фильтра галереи. */
export function initScrollAnimations() {
  $$('.anim-fade-up:not(.visible)').forEach(el => _scrollObserver.observe(el))
}

/* --- Хедер при скролле ---
   • Главная: .scrolled появляется после 60px скролла (полупрозрачный фон с blur).
   • Портфолио: хедер полностью скрыт (.header--hidden), кнопка «На главную» заменяет его.
   • Отзывы: хедер всегда с фоном (.scrolled), т.к. нет hero-картинки.
   • Активная ссылка подсвечивается золотым — зависит от текущей секции. */
export function initHeaderScroll() {
  const header = $('#header')
  let ticking = false                       /* Флаг: requestAnimationFrame в полёте? */
  const page = window.__PAGE__
  let sections = []
  let navLinks = $$('.nav__links a')

  if (page === 'index') {
    /* На главной — отслеживаем секции для активной ссылки */
    sections = ['about', 'featured', 'services', 'contact']
  }

  if (page === 'portfolio' && header) {
    /* На портфолио — хедер скрыт полностью */
    header.classList.add('header--hidden')
  }

  if (page === 'reviews' && header) {
    /* На отзывах — хедер всегда с фоном */
    header.classList.add('scrolled')
  }

  const sectionEls = sections.map(id => document.getElementById(id)).filter(Boolean)

  function updateActiveNav() {
    /* Переключаем .scrolled на главной */
    if (header && page === 'index') {
      header.classList.toggle('scrolled', window.scrollY > 60) /* 60px — порог, чтобы не мигал на микро-скролле */
    }

    /* Определяем активную ссылку навигации */
    navLinks.forEach(link => {
      const href = link.getAttribute('href')
      let isActive = false

      if (page === 'index') {
        /* На главной: активна секция, чей верх выше 150px от viewport.
           Последняя такая секция = текущая. */
        let activeId = ''
        for (const el of sectionEls) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 150) activeId = el.id /* 150px — запас, чтобы секция считалась активной чуть раньше */
        }
        isActive = activeId !== '' && (href === `#${activeId}` || href === `/#${activeId}`)
      } else if (page === 'portfolio') {
        isActive = href === '/portfolio/'
      } else if (page === 'reviews') {
        isActive = href === '/reviews/'
      }

      link.classList.toggle('nav__link--active', isActive) /* Золотой цвет активной ссылки (CSS) */
    })
  }

  /* Слушатель скролла с throttling через requestAnimationFrame.
     Без throttling — updateActiveNav() вызывалась бы 60+ раз/сек,
     что ненужно и тратит CPU. */
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateActiveNav()
        ticking = false
      })
      ticking = true
    }
  })

  /* Первичная проверка — при загрузке страницы */
  updateActiveNav()
}

/* --- Hero-анимации ---
   Элементы hero (.hero .anim-fade-up) появляются сразу,
   без ожидания скролла. Задержка 200мс — чтобы CSS-переход
   сработал (если добавить .visible мгновенно — transition не анимируется). */
export function initHeroAnimations() {
  setTimeout(() => {
    $$('.hero .anim-fade-up').forEach(el => {
      el.classList.add('visible')
    })
  }, 200) /* 200мс — достаточно чтобы браузер отрендерил начальное состояние и transition сработал */
}
