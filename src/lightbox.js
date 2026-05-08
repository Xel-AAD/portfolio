import { $ } from './dom.js'
import { getLightboxList, getLightboxIndex, setLightboxIndex } from './state.js'

let _lbTimer = null
let _lbCloseTimer = null
let _lbTouchTimer = null
const _lbT = 'translate(-50%,-50%)'

function _lbSetLoading(on) {
  const lb = $('#lightbox')
  if (!lb) return
  if (on) {
    lb.classList.add('lb-loading')
    lb.classList.remove('lb-done')
  } else {
    lb.classList.remove('lb-loading')
    lb.classList.add('lb-done')
  }
}

function _lbLoadFull(full, src, idx) {
  _lbSetLoading(true)
  full.onload = () => {
    if (getLightboxIndex() === idx) {
      full.classList.add('loaded')
      _lbSetLoading(false)
    }
  }
  full.src = src
  if (full.complete && full.naturalWidth > 0) {
    full.classList.add('loaded')
    _lbSetLoading(false)
  }
}

export function openLightbox(index) {
  const lightbox = $('#lightbox')
  const thumb = $('#lightboxThumb')
  const full = $('#lightboxFull')
  const info = $('#lightboxInfo')
  const counter = $('#lightboxCounter')

  if (_lbCloseTimer) {
    clearTimeout(_lbCloseTimer)
    _lbCloseTimer = null
  }

  setLightboxIndex(index)
  const photo = getLightboxList()[index]

  info.textContent = photo.title
  counter.textContent = `${index + 1} / ${getLightboxList().length}`

  full.classList.remove('loaded')
  full.removeAttribute('src')

  thumb.style.transition = 'none'
  thumb.style.opacity = '0'
  thumb.style.transform = `${_lbT} scale(0.92)`
  thumb.style.filter = 'blur(25px)'
  thumb.src = photo.thumb
  thumb.alt = photo.title

  lightbox.classList.add('open')
  lightbox.classList.remove('lb-loading', 'lb-done')
  lightbox.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open')
  document.documentElement.style.overflow = 'hidden'

  const startZoom = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        thumb.style.transition = 'opacity 0.4s ease, transform 0.45s cubic-bezier(0.22,1,0.36,1), filter 0.8s ease'
        thumb.style.opacity = '1'
        thumb.style.transform = `${_lbT} scale(1)`
        thumb.style.filter = 'blur(25px)'
      })
    })

    if (getLightboxIndex() === index) {
      _lbLoadFull(full, photo.src, index)
    }
  }

  if (thumb.complete && thumb.naturalWidth > 0) {
    startZoom()
  } else {
    thumb.addEventListener('load', startZoom, { once: true })
  }
}

export function closeLightbox() {
  const lightbox = $('#lightbox')
  const thumb = $('#lightboxThumb')
  const full = $('#lightboxFull')

  thumb.style.transition = 'opacity 0.3s ease, transform 0.3s ease'
  thumb.style.opacity = '0'
  thumb.style.transform = `${_lbT} scale(0.95)`

  full.classList.remove('loaded')
  lightbox.classList.remove('lb-loading', 'lb-done')

  if (_lbTimer) {
    clearTimeout(_lbTimer)
    _lbTimer = null
  }

  const closingIndex = getLightboxIndex()
  setLightboxIndex(-1)

  setTimeout(() => {
    if (getLightboxIndex() !== -1) return
    lightbox.classList.remove('open')
    lightbox.setAttribute('aria-hidden', 'true')
    document.documentElement.classList.remove('lightbox-open')
    document.documentElement.style.overflow = ''
    thumb.style.transition = ''
    thumb.style.opacity = ''
    thumb.style.transform = ''
    thumb.style.filter = ''
    full.removeAttribute('src')
    _lbCloseTimer = null
  }, 300)
}

export function navigateLightbox(direction) {
  if (getLightboxIndex() === -1) return

  const thumb = $('#lightboxThumb')
  const full = $('#lightboxFull')

  thumb.style.transition = 'opacity 0.25s ease, transform 0.25s ease'
  thumb.style.opacity = '0'
  thumb.style.transform = `${_lbT} scale(0.98)`
  full.classList.remove('loaded')

  const lb = $('#lightbox')
  if (lb) lb.classList.remove('lb-done')

  if (_lbTimer) clearTimeout(_lbTimer)

  _lbTimer = setTimeout(() => {
    const list = getLightboxList()
    let newIdx = getLightboxIndex() + direction
    if (newIdx < 0) newIdx = list.length - 1
    if (newIdx >= list.length) newIdx = 0

    setLightboxIndex(newIdx)
    const photo = list[newIdx]

    const info = $('#lightboxInfo')
    const counter = $('#lightboxCounter')
    if (info) info.textContent = photo.title
    if (counter) counter.textContent = `${newIdx + 1} / ${list.length}`

    full.removeAttribute('src')
    thumb.src = photo.thumb
    thumb.alt = photo.title
    thumb.style.filter = 'blur(25px)'

    const showNew = () => {
      requestAnimationFrame(() => {
        thumb.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1), filter 0.8s ease'
        thumb.style.opacity = '1'
        thumb.style.transform = `${_lbT} scale(1)`
      })
      _lbLoadFull(full, photo.src, newIdx)
    }

    if (thumb.complete && thumb.naturalWidth > 0) {
      showNew()
    } else {
      thumb.addEventListener('load', showNew, { once: true })
    }

    _lbTimer = null
  }, 250)
}

export function initLightbox() {
  const lightbox = $('#lightbox')
  if (!lightbox) return

  const closeBtn = $('#lightboxClose')
  const prevBtn = $('#lightboxPrev')
  const nextBtn = $('#lightboxNext')

  if (closeBtn) closeBtn.addEventListener('click', closeLightbox)
  if (prevBtn) prevBtn.addEventListener('click', () => navigateLightbox(-1))
  if (nextBtn) nextBtn.addEventListener('click', () => navigateLightbox(1))

  lightbox.addEventListener('click', e => {
    if (e.target === lightbox) closeLightbox()
  })

  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return
    if (e.key === 'Escape') closeLightbox()
    if (e.key === 'ArrowLeft') navigateLightbox(-1)
    if (e.key === 'ArrowRight') navigateLightbox(1)
  })

  let touchStartX = 0
  let touchStartY = 0
  lightbox.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX
    touchStartY = e.changedTouches[0].screenY
    if (prevBtn) prevBtn.style.opacity = '1'
    if (nextBtn) nextBtn.style.opacity = '1'
  }, { passive: true })

  lightbox.addEventListener('touchend', e => {
    const diffX = e.changedTouches[0].screenX - touchStartX
    const diffY = e.changedTouches[0].screenY - touchStartY
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
      navigateLightbox(diffX > 0 ? -1 : 1)
    }
    if (Math.abs(diffY) > 100 && diffY > 0 && Math.abs(diffY) > Math.abs(diffX)) {
      closeLightbox()
    }
    if (_lbTouchTimer) clearTimeout(_lbTouchTimer)
    _lbTouchTimer = setTimeout(() => {
      if (prevBtn) prevBtn.style.opacity = ''
      if (nextBtn) nextBtn.style.opacity = ''
      _lbTouchTimer = null
    }, 1500)
  }, { passive: true })
}
