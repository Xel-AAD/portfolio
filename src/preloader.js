


const STORAGE_KEY = '__preloader_shown__'
const MAX_WAIT = 16000

const CONTENT_APPEAR_DELAY = 500
const LINE_START_DELAY = 800
const PHASE1_DURATION = 600
const PHASE2_DURATION = 5000
const PHASE3_DURATION = 1200
const FINISH_PAUSE = 800
const EXIT_ANIMATION_DURATION = 1200

export function initPreloader() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    removePreloader()
    return
  }

  if (sessionStorage.getItem(STORAGE_KEY)) {
    removePreloader()
    return
  }

  const preloader = document.getElementById('preloader')
  if (!preloader) return

  const line = preloader.querySelector('.preloader__line')
  const text = preloader.querySelector('.preloader__text')
  const content = preloader.querySelector('.preloader__content')

  if (content) {
    setTimeout(() => content.classList.add('preloader__content--visible'), CONTENT_APPEAR_DELAY)
  }

  let animId = null
  let done = false
  let loadReady = false
  let currentPhase = 0

  let phaseStart = 0
  let phaseFrom = 0
  let phaseTo = 0
  let phaseDuration = 0

  function startPhase(from, to, duration) {
    phaseFrom = from
    phaseTo = to
    phaseDuration = duration
    phaseStart = performance.now()
  }

  function animateLine(timestamp) {
    const elapsed = timestamp - phaseStart
    const t = Math.min(elapsed / phaseDuration, 1)

    let eased
    if (currentPhase === 1) {
      eased = 1 - Math.pow(1 - t, 3)
    } else if (currentPhase === 2) {
      eased = -(Math.cos(Math.PI * t) - 1) / 2
    } else {
      eased = t * t
    }

    const progress = phaseFrom + (phaseTo - phaseFrom) * eased

    const lineWidth = Math.min(progress, 1) * 100
    if (line) line.style.width = lineWidth + '%'

    if (text) {
      text.style.opacity = Math.min(progress, 1)

      if (progress > 1) {
        const overexposure = (progress - 1) / 0.2
        text.style.filter = `brightness(${1 + overexposure * 0.4})`
      } else {
        text.style.filter = ''
      }
    }

    if (t >= 1 && !done) {
      if (phaseTo >= 1.2) {
        done = true
        if (text) {
          text.style.opacity = '1'
        }
        finish(preloader)
        return
      }

      if (currentPhase === 1) {
        currentPhase = 2
        startPhase(0.4, 0.8, PHASE2_DURATION)
      } else if (currentPhase === 2) {
        currentPhase = 3
        startPhase(0.8, 1.2, PHASE3_DURATION)
      }
    }

    animId = requestAnimationFrame(animateLine)
  }

  let lineStarted = false

  function startLineAnimation() {
    if (lineStarted) return
    lineStarted = true
    currentPhase = 1
    startPhase(0, 0.4, PHASE1_DURATION)
    animId = requestAnimationFrame(animateLine)
  }

  setTimeout(startLineAnimation, LINE_START_DELAY)

  const loadPromise = new Promise(resolve => {
    if (document.readyState === 'complete') {
      resolve()
    } else {
      window.addEventListener('load', resolve, { once: true })
    }
  })

  loadPromise.then(() => {
    loadReady = true
  })

  const checkInterval = setInterval(() => {
    if (done) {
      clearInterval(checkInterval)
      return
    }
    if (loadReady && currentPhase === 2 && phaseTo === 0.8) {
      clearInterval(checkInterval)
      const elapsed = performance.now() - phaseStart
      const t = Math.min(elapsed / phaseDuration, 1)
      const eased = -(Math.cos(Math.PI * t) - 1) / 2
      const currentProgress = phaseFrom + (phaseTo - phaseFrom) * eased
      currentPhase = 3
      startPhase(currentProgress, 1.2, PHASE3_DURATION)
    }
  }, 100)

  setTimeout(() => {
    if (preloader.parentNode && !done) {
      done = true
      clearInterval(checkInterval)
      if (animId) cancelAnimationFrame(animId)
      if (line) line.style.width = '100%'
      if (text) {
        text.style.opacity = '1'
        text.style.transition = 'filter 0.6s ease-out'
        text.style.filter = 'brightness(1)'
      }
      finish(preloader)
    }
  }, MAX_WAIT)
}

function finish(preloader) {
  const text = preloader.querySelector('.preloader__text')
  if (text && text.style.filter) {
    text.style.transition = 'filter 0.6s ease-out'
    text.style.filter = 'brightness(1)'
  }
  setTimeout(() => {
    preloader.classList.add('preloader--exit')
    sessionStorage.setItem(STORAGE_KEY, '1')
    preloader.addEventListener('animationend', () => {
      preloader.remove()
    }, { once: true })
    setTimeout(() => preloader.remove(), EXIT_ANIMATION_DURATION + 200)
  }, FINISH_PAUSE)
}

function removePreloader() {
  const el = document.getElementById('preloader')
  if (el) el.remove()
}
