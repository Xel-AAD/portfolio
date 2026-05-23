/* ============================================================
   PAGE-TRANSITION.JS — Color Wash (плавная версия v4)
   Частицы заполняют экран, затем сразу начинается View Transition.
   Рендеринг не останавливается до фактической смены страницы.
   Старая сцена (с оверлеем) плавно затухает, новая проявляется.
============================================================ */

const PARTICLE_COUNT = 400
const WAVE_FREQ = 0.008
const WAVE_AMP = 30
const ENTER_DURATION = 1800
const HOLD_BEFORE_NAVIGATE = 150   // короткая пауза с заполненным экраном

const GOLD = { r: 201, g: 169, b: 110 }
const DARK = { r: 26, g: 20, b: 8 }
const BG = { r: 10, g: 10, b: 10 }

let washEl = null
let canvas = null
let ctx = null
let particles = []
let animId = null
let phase = 'idle'          // 'idle' | 'enter' | 'hold'
let phaseStart = 0
let pendingUrl = null
let navigateTimer = null
let navigationStarted = false   // флаг, чтобы не запускать переход дважды

// ---------- утилиты ----------
function lerp(a, b, t) { return a + (b - a) * t }

function lerpColor(c1, c2, t) {
  return {
    r: Math.round(lerp(c1.r, c2.r, t)),
    g: Math.round(lerp(c1.g, c2.g, t)),
    b: Math.round(lerp(c1.b, c2.b, t))
  }
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3) }

// ---------- частицы ----------
function createParticle(w, h) {
  const t = Math.random()
  let colorObj
  if (t < 0.3) {
    colorObj = lerpColor(BG, DARK, Math.random())
  } else if (t < 0.7) {
    colorObj = lerpColor(DARK, GOLD, Math.random() * 0.6)
  } else {
    colorObj = lerpColor(GOLD, { r: 212, g: 184, b: 122 }, Math.random())
  }
  return {
    homeX: Math.random() * w,
    y: Math.random() * h,
    size: 1 + Math.random() * 4,
    colorStr: `rgb(${colorObj.r},${colorObj.g},${colorObj.b})`,
    alpha: 0.4 + Math.random() * 0.6,
    waveOffset: Math.random() * Math.PI * 2,
    waveFreq: WAVE_FREQ * (0.7 + Math.random() * 0.6),
    waveAmp: WAVE_AMP * (0.5 + Math.random() * 1),
    delay: Math.random() * 0.4,
    baseY: 0
  }
}

function initParticles() {
  const w = window.innerWidth
  const h = window.innerHeight
  if (!canvas) return

  canvas.width = w * devicePixelRatio
  canvas.height = h * devicePixelRatio
  canvas.style.width = w + 'px'
  canvas.style.height = h + 'px'
  ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(devicePixelRatio, devicePixelRatio)

  particles = []
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = createParticle(w, h)
    p.baseY = p.y
    particles.push(p)
  }
}

// ---------- рендер ----------
function renderFrame(timestamp) {
  if (phase === 'idle') {
    animId = null
    return
  }

  const w = window.innerWidth
  const h = window.innerHeight

  if (!canvas || !ctx) {
    emergencyHide()
    return
  }

  ctx.clearRect(0, 0, w, h)

  if (phase === 'enter') {
    const progress = Math.min((timestamp - phaseStart) / ENTER_DURATION, 1)

    for (const p of particles) {
      const effectiveProgress = Math.max(0, (progress - p.delay) / (1 - p.delay))
      if (effectiveProgress <= 0) continue

      const eased = easeOutCubic(effectiveProgress)
      const startX = p.homeX - w
      const currentX = startX + (p.homeX - startX) * eased
      const waveX = Math.sin(p.baseY * p.waveFreq + timestamp * 0.002 + p.waveOffset) * p.waveAmp * eased
      const x = currentX + waveX
      const y = p.baseY + (p.y - p.baseY) * 0.1 * (timestamp - phaseStart) * 0.01

      const fadeIn = Math.min(effectiveProgress * 3, 1)
      const alpha = p.alpha * fadeIn
      if (x < -20 || x > w + 20 || alpha <= 0) continue

      ctx.globalAlpha = alpha
      ctx.fillStyle = p.colorStr
      ctx.beginPath()
      ctx.arc(Math.round(x), Math.round(y) % h, p.size, 0, Math.PI * 2)
      ctx.fill()
    }

    if (progress >= 1) {
      phase = 'hold'
      phaseStart = timestamp
    }
  } else if (phase === 'hold') {
    for (const p of particles) {
      const waveX = Math.sin(p.baseY * p.waveFreq + timestamp * 0.002 + p.waveOffset) * p.waveAmp
      const x = p.homeX + waveX + (Math.random() - 0.5) * 1.5
      const y = p.baseY + (Math.random() - 0.5) * 1.5

      ctx.globalAlpha = p.alpha * 0.85
      ctx.fillStyle = p.colorStr
      ctx.beginPath()
      ctx.arc(Math.round(x), Math.round(y) % h, p.size * 0.9, 0, Math.PI * 2)
      ctx.fill()
    }

    // Запускаем переход только один раз, когда пройдёт короткая пауза
    const elapsed = timestamp - phaseStart
    if (!navigationStarted && elapsed >= HOLD_BEFORE_NAVIGATE && pendingUrl) {
      navigationStarted = true
      performNavigation(pendingUrl)
    }
  }

  // Рендеринг продолжается, даже если переход уже начат
  animId = requestAnimationFrame(renderFrame)
}

// ---------- навигация ----------
function performNavigation(url) {
  // Снимаем флаг pendingUrl, чтобы избежать повторного вызова
  pendingUrl = null

  // View Transition: снимок будет содержать текущий кадр с оверлеем.
  // Рендеринг не останавливаем, чтобы частицы двигались до последнего момента.
  if (document.startViewTransition) {
    document.startViewTransition(() => {
      window.location.href = url
    })
  } else {
    window.location.href = url
  }
}

// ---------- управление оверлеем ----------
function getOrCreateWash() {
  if (washEl) return washEl

  washEl = document.createElement('div')
  washEl.id = 'page-wash'
  washEl.setAttribute('aria-hidden', 'true')

  const bg = document.createElement('div')
  bg.className = 'page-wash__bg'

  canvas = document.createElement('canvas')
  canvas.id = 'washCanvas'

  washEl.appendChild(bg)
  washEl.appendChild(canvas)
  document.documentElement.appendChild(washEl)

  return washEl
}

function showWash() {
  if (phase !== 'idle') return

  getOrCreateWash()
  initParticles()
  if (!ctx) {
    destroyWash()
    return
  }

  washEl.classList.remove('page-wash--exit')
  requestAnimationFrame(() => {
    washEl.classList.add('page-wash--active')
  })

  phase = 'enter'
  phaseStart = performance.now()
  navigationStarted = false
  animId = requestAnimationFrame(renderFrame)

  // страховка: если переход не случится, принудительно убираем оверлей
  navigateTimer = setTimeout(() => {
    if (!navigationStarted && pendingUrl) {
      navigationStarted = true
      performNavigation(pendingUrl)
    } else if (phase !== 'idle') {
      emergencyHide()
    }
  }, ENTER_DURATION + HOLD_BEFORE_NAVIGATE + 5000)
}

function hideWash() {
  if (!washEl) return
  washEl.classList.remove('page-wash--active')
  washEl.classList.add('page-wash--exit')
  setTimeout(() => destroyWash(), 650)
}

function emergencyHide() {
  if (animId) cancelAnimationFrame(animId)
  phase = 'idle'
  particles = []
  destroyWash()
  pendingUrl = null
}

function destroyWash() {
  if (washEl) {
    washEl.remove()
    washEl = null
    canvas = null
    ctx = null
  }
  if (navigateTimer) clearTimeout(navigateTimer)
}

// ---------- проверки ссылок ----------
function isInternalLink(href) {
  if (!href) return false
  if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return false
  try {
    const url = new URL(href, location.origin)
    return url.origin === location.origin
  } catch {
    return false
  }
}

function isSamePageAnchor(href) {
  try {
    const url = new URL(href, location.origin)
    return url.origin === location.origin && url.pathname === location.pathname && url.hash.length > 0
  } catch {
    return false
  }
}

// ---------- инициализация ----------
export function initPageTransition() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]')
    if (!link) return
    const href = link.getAttribute('href')
    if (!isInternalLink(href) || isSamePageAnchor(href)) return
    if (link.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return

    e.preventDefault()
    pendingUrl = href
    showWash()
  })

 window.addEventListener('pageshow', (e) => {
 if (navigateTimer) {
 clearTimeout(navigateTimer)
 navigateTimer = null
 }
 if (animId) {
 cancelAnimationFrame(animId)
 animId = null
 }
 destroyWash()
 phase = 'idle'
 particles = []
 navigationStarted = false
 pendingUrl = null
 })

  window.addEventListener('pagehide', () => {
    if (animId) cancelAnimationFrame(animId)
    destroyWash()
  })
}