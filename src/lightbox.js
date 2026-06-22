import { $ } from './dom.js'
import { getLightboxList, getLightboxIndex, setLightboxIndex } from './state.js'
import { stopSmoothScroll, startSmoothScroll } from './smooth-scroll.js'

let _lbTimer = null 
let _lbCloseTimer = null 
let _lbTouchTimer = null 
let _lbPreviousFocus = null 
const _lbT = 'translate(-50%,-50%)' 


const ZOOM_MIN = 1
const ZOOM_MAX = 5
const ZOOM_DOUBLE_TAP = 2.5                  
const ZOOM_SNAP = 1.1                        

const _lbZoom = { scale: 1, x: 0, y: 0 }


let _lbPinchActive = false
let _lbPinchStartDist = 0                    
let _lbPinchStartScale = 1                   
let _lbPinchCenterX = 0                      
let _lbPinchCenterY = 0
let _lbZoomAtPinchX = 0                      
let _lbZoomAtPinchY = 0


let _lbPanActive = false
let _lbPanStartX = 0
let _lbPanStartY = 0
let _lbZoomAtPanX = 0
let _lbZoomAtPanY = 0


let _lbMousePanActive = false
let _lbMousePanStartX = 0
let _lbMousePanStartY = 0
let _lbMouseZoomStartX = 0
let _lbMouseZoomStartY = 0


let _lbLastTapTime = 0
let _lbLastTapX = 0
let _lbLastTapY = 0


let _lbClickTimer = null
let _lbTouchDoubleTapAt = 0                  


function _lbApplyZoom(animate = false) {
  const zoom = $('#lightboxZoom')
  if (!zoom) return
  const z = _lbZoom

  if (animate) {
    zoom.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)'
  } else {
    zoom.style.transition = 'none'
  }

  if (z.scale === 1 && z.x === 0 && z.y === 0) {
    zoom.style.transform = ''
    zoom.classList.remove('lightbox__zoom--zoomed')
  } else {
    zoom.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.scale})`
    zoom.classList.add('lightbox__zoom--zoomed')
  }
}


function _lbResetZoom(animate = false) {
  _lbZoom.scale = 1
  _lbZoom.x = 0
  _lbZoom.y = 0
  _lbPinchActive = false
  _lbPanActive = false
  _lbMousePanActive = false
  _lbApplyZoom(animate)
}


function _lbTouchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}


function _lbRelCenter(clientX, clientY) {
  const lb = $('#lightbox')
  if (!lb) return { x: 0, y: 0 }
  const r = lb.getBoundingClientRect()
  return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 }
}


function _lbZoomTo(newScale, cx, cy, animate = false) {
  newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale))
  const oldScale = _lbZoom.scale
  if (oldScale === 0) return
  const ratio = newScale / oldScale
  _lbZoom.x = cx - (cx - _lbZoom.x) * ratio
  _lbZoom.y = cy - (cy - _lbZoom.y) * ratio
  _lbZoom.scale = newScale
  _lbApplyZoom(animate)
}


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
  const thumb = $('#lightboxThumb')
  full.onload = () => {
    if (getLightboxIndex() === idx) {
      full.classList.add('loaded')
      if (thumb) {
        thumb.style.transition = 'opacity 0.4s ease'
        thumb.style.opacity = '0'
      }
      _lbSetLoading(false)
    }
  }
  full.onerror = () => {
    if (getLightboxIndex() === idx) {
      _lbSetLoading(false)
    }
  }
  full.src = src

  if (full.complete && full.naturalWidth > 0) {
    full.classList.add('loaded')
    if (thumb) thumb.style.opacity = '0'
    _lbSetLoading(false)
  }
}


function _lbFocusTrap(e) {
 if (e.key !== 'Tab') return
 const lightbox = $('#lightbox')
 if (!lightbox) return
 const focusable = lightbox.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
 if (!focusable.length) return
 const first = focusable[0]
 const last = focusable[focusable.length - 1]
 if (e.shiftKey) {
 if (document.activeElement === first) {
 e.preventDefault()
 last.focus()
 }
 } else {
 if (document.activeElement === last) {
 e.preventDefault()
 first.focus()
 }
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

  _lbResetZoom()                               

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
  thumb.src = photo.src.replace('/photos/', '/photos/thumbs/')
  thumb.alt = photo.title


  lightbox.classList.add('open')
  lightbox.classList.remove('lb-loading', 'lb-done')
 lightbox.setAttribute('aria-hidden', 'false')
	document.documentElement.classList.add('lightbox-open')
	stopSmoothScroll()


 _lbPreviousFocus = document.activeElement
 document.addEventListener('keydown', _lbFocusTrap)
 const closeBtn = $('#lightboxClose')
 if (closeBtn) closeBtn.focus()




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
    _lbLoadFull(full, photo.src.replace('/photos/', '/photos/lightbox/'), index)
  }
  }

// Предзагружаем оригиналы соседних фото
const list = getLightboxList()
const preloadIndices = [index - 1, index + 1]
preloadIndices.forEach(i => {
  if (i >= 0 && i < list.length) {
    const img = new Image()
    img.src = list[i].src.replace('/photos/', '/photos/lightbox/')
  }
})



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

  _lbResetZoom()                               


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


 document.removeEventListener('keydown', _lbFocusTrap)


  setTimeout(() => {

    if (getLightboxIndex() !== -1) return

    lightbox.classList.remove('open')
    lightbox.setAttribute('aria-hidden', 'true')
		document.documentElement.classList.remove('lightbox-open')
		startSmoothScroll()


    thumb.style.transition = ''
    thumb.style.opacity = ''
    thumb.style.transform = ''
    thumb.style.filter = ''
 full.removeAttribute('src')
 _lbCloseTimer = null


 if (_lbPreviousFocus && typeof _lbPreviousFocus.focus === 'function') {
 _lbPreviousFocus.focus()
 _lbPreviousFocus = null
 }
 }, 300) 
}


export function navigateLightbox(direction) {
  if (getLightboxIndex() === -1) return       

  const thumb = $('#lightboxThumb')
  const full = $('#lightboxFull')


const _lbMobile = window.innerWidth <= 768
const _lbOutDur = _lbMobile ? 150 : 250
const _lbInDelay = _lbMobile ? 150 : 250
thumb.style.transition = `opacity ${_lbOutDur}ms ease, transform ${_lbOutDur}ms ease`
thumb.style.opacity = '0'
thumb.style.transform = `${_lbT} scale(0.98)`
full.classList.remove('loaded')

const lb = $('#lightbox')
if (lb) lb.classList.remove('lb-done')


if (_lbTimer) clearTimeout(_lbTimer)

_lbResetZoom() 


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
    thumb.src = photo.src.replace('/photos/', '/photos/thumbs/')
	thumb.alt = photo.title
	thumb.style.filter = 'blur(25px)' 


    const showNew = () => {
      requestAnimationFrame(() => {
        thumb.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1), filter 0.8s ease'
        thumb.style.opacity = '1'
        thumb.style.transform = `${_lbT} scale(1)`
      })
      _lbLoadFull(full, photo.src.replace('/photos/', '/photos/lightbox/'), newIdx)
    }

    if (thumb.complete && thumb.naturalWidth > 0) {
      showNew()
    } else {
      thumb.addEventListener('load', showNew, { once: true })
    }

	_lbTimer = null
	}, _lbInDelay)
}


let _lbInited = false

export function initLightbox() {
  if (_lbInited) return
  _lbInited = true
  const lightbox = $('#lightbox')
  if (!lightbox) return

  const zoom = $('#lightboxZoom')
  const closeBtn = $('#lightboxClose')
  const prevBtn = $('#lightboxPrev')
  const nextBtn = $('#lightboxNext')


  if (closeBtn) closeBtn.addEventListener('click', closeLightbox)
  if (prevBtn) prevBtn.addEventListener('click', () => navigateLightbox(-1))
  if (nextBtn) nextBtn.addEventListener('click', () => navigateLightbox(1))




  if (zoom) {
    zoom.addEventListener('click', e => {
      if (Date.now() - _lbTouchDoubleTapAt < 500) return
      const onPhoto = e.target.tagName === 'IMG'
      if (onPhoto && _lbZoom.scale <= 1) return
      if (!onPhoto && _lbZoom.scale <= 1) {
        closeLightbox()
        return
      }

      if (_lbClickTimer) return
      _lbClickTimer = setTimeout(() => {
        _lbClickTimer = null
        _lbResetZoom(true)
      }, 250)
    })

    zoom.addEventListener('dblclick', e => {
      if (Date.now() - _lbTouchDoubleTapAt < 500) return
      if (_lbClickTimer) {
        clearTimeout(_lbClickTimer)
        _lbClickTimer = null
      }
      e.preventDefault()
      const rel = _lbRelCenter(e.clientX, e.clientY)
      if (_lbZoom.scale > 1) {
        _lbResetZoom(true)
      } else {
        _lbZoomTo(ZOOM_DOUBLE_TAP, rel.x, rel.y, true)
      }
    })
  }




  if (zoom) {
    zoom.addEventListener('wheel', e => {
      if (!lightbox.classList.contains('open')) return
      e.preventDefault()
      const rel = _lbRelCenter(e.clientX, e.clientY)
      let newScale
      if (e.ctrlKey) {


        const factor = 1 - e.deltaY * 0.01
        newScale = _lbZoom.scale * Math.max(0.8, Math.min(1.2, factor))
      } else {

        const factor = e.deltaY > 0 ? 0.92 : 1.08
        newScale = _lbZoom.scale * factor
      }
      _lbZoomTo(newScale, rel.x, rel.y)

      if (_lbZoom.scale < ZOOM_SNAP && _lbZoom.scale > ZOOM_MIN) {
        _lbResetZoom(true)
      }
    }, { passive: false })
  }




 if (zoom) {
  zoom.addEventListener('mousedown', e => {
   if (_lbZoom.scale <= 1) return
   if (e.target.tagName !== 'IMG') return
		_lbMousePanActive = true
		_lbMousePanStartX = e.clientX
		_lbMousePanStartY = e.clientY
		_lbMouseZoomStartX = _lbZoom.x
		_lbMouseZoomStartY = _lbZoom.y
   zoom.style.cursor = 'grabbing'
   e.preventDefault()
  })
 }

  window.addEventListener('mousemove', e => {
    if (!_lbMousePanActive) return
    _lbZoom.x = _lbMouseZoomStartX + (e.clientX - _lbMousePanStartX)
    _lbZoom.y = _lbMouseZoomStartY + (e.clientY - _lbMousePanStartY)
    _lbApplyZoom()
  })

window.addEventListener('mouseup', () => {
  if (_lbMousePanActive) {
    _lbMousePanActive = false
    zoom.style.cursor = ''
    if (_lbZoom.scale < ZOOM_SNAP) {
      _lbResetZoom(true)
    }
  }
})


document.addEventListener('keydown', e => {
	if (!lightbox.classList.contains('open')) return
	if (e.key === 'Escape') closeLightbox()
	if (e.key === 'ArrowLeft') navigateLightbox(-1)
	if (e.key === 'ArrowRight') navigateLightbox(1)
})

function _lbSwipeSpringBack() {
	const thumb = $('#lightboxThumb')
	const lb = $('#lightbox')
	if (thumb) {
		thumb.style.transition = 'transform 0.35s cubic-bezier(0.22,1,0.36,1)'
		thumb.style.transform = `${_lbT} scale(1)`
	}
	if (lb) {
		lb.style.transition = 'background-color 0.35s ease'
		lb.style.backgroundColor = ''
	}
}

function _lbSwipeResetVisuals() {
	const thumb = $('#lightboxThumb')
	const lb = $('#lightbox')
	if (thumb) {
		thumb.style.transition = ''
		thumb.style.transform = ''
	}
	if (lb) {
		lb.style.transition = ''
		lb.style.backgroundColor = ''
	}
}


let touchStartX = 0
let touchStartY = 0
let touchStartFingers = 0
let _lbSwipeActive = false
let _lbSwipeStartX = 0
let _lbSwipeStartY = 0
let _lbSwipeLastX = 0
let _lbSwipeLastTime = 0

  lightbox.addEventListener('touchstart', e => {
    const touches = e.touches
    touchStartFingers = touches.length

    if (touches.length === 2 && zoom) {



		_lbPinchActive = true
		_lbPanActive = false
		_lbSwipeActive = false
		_lbSwipeResetVisuals()
		_lbPinchStartDist = _lbTouchDist(touches[0], touches[1])
      _lbPinchStartScale = _lbZoom.scale
      const cx = (touches[0].clientX + touches[1].clientX) / 2
      const cy = (touches[0].clientY + touches[1].clientY) / 2
      const rel = _lbRelCenter(cx, cy)
      _lbPinchCenterX = rel.x
      _lbPinchCenterY = rel.y
      _lbZoomAtPinchX = _lbZoom.x
      _lbZoomAtPinchY = _lbZoom.y
	} else if (touches.length === 1) {
		touchStartX = touches[0].clientX
		touchStartY = touches[0].clientY

		if (_lbZoom.scale > 1) {
			_lbPanActive = true
			_lbPanStartX = touches[0].clientX
			_lbPanStartY = touches[0].clientY
			_lbZoomAtPanX = _lbZoom.x
			_lbZoomAtPanY = _lbZoom.y
		} else {
			_lbSwipeActive = true
			_lbSwipeStartX = touches[0].clientX
			_lbSwipeStartY = touches[0].clientY
			_lbSwipeLastX = touches[0].clientX
			_lbSwipeLastTime = Date.now()
		}


      if (prevBtn) prevBtn.style.opacity = '1'
      if (nextBtn) nextBtn.style.opacity = '1'
    }
  }, { passive: true })

  lightbox.addEventListener('touchmove', e => {
    const touches = e.touches

    if (_lbPinchActive && touches.length === 2 && zoom) {



      const dist = _lbTouchDist(touches[0], touches[1])
      const newScale = _lbPinchStartScale * (dist / _lbPinchStartDist)
      const clampedScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale))
      const ratio = clampedScale / _lbPinchStartScale
      _lbZoom.scale = clampedScale
      _lbZoom.x = _lbPinchCenterX - (_lbPinchCenterX - _lbZoomAtPinchX) * ratio
      _lbZoom.y = _lbPinchCenterY - (_lbPinchCenterY - _lbZoomAtPinchY) * ratio
      _lbApplyZoom()
	} else if (_lbPanActive && touches.length === 1) {
			_lbZoom.x = _lbZoomAtPanX + (touches[0].clientX - _lbPanStartX)
			_lbZoom.y = _lbZoomAtPanY + (touches[0].clientY - _lbPanStartY)
			_lbApplyZoom()
		} else if (_lbSwipeActive && touches.length === 1 && _lbZoom.scale === 1) {
			const deltaX = touches[0].clientX - _lbSwipeStartX
			const deltaY = touches[0].clientY - _lbSwipeStartY

			if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
				const thumb = $('#lightboxThumb')
				if (thumb) {
					thumb.style.transition = 'none'
					thumb.style.transform = `${_lbT} translateX(${deltaX}px) scale(${1 - Math.abs(deltaX) / 2000})`
				}
				const lb = $('#lightbox')
				if (lb) lb.style.backgroundColor = `rgba(0,0,0,${1 - Math.abs(deltaX) / 800})`
			} else if (deltaY > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
				const thumb = $('#lightboxThumb')
				if (thumb) {
					thumb.style.transition = 'none'
					thumb.style.transform = `${_lbT} translateY(${deltaY}px) scale(${1 - deltaY / 1000})`
				}
				const lb = $('#lightbox')
				if (lb) lb.style.backgroundColor = `rgba(0,0,0,${1 - deltaY / 600})`
			}
			_lbSwipeLastX = touches[0].clientX
			_lbSwipeLastTime = Date.now()
		}
  }, { passive: true })




	lightbox.addEventListener('touchcancel', () => {
		_lbPinchActive = false
		_lbPanActive = false
		_lbSwipeActive = false
		_lbSwipeResetVisuals()
	}, { passive: true })

  lightbox.addEventListener('touchend', e => {



    if (_lbPinchActive && e.touches.length < 2) {
      _lbPinchActive = false
      if (_lbZoom.scale < ZOOM_SNAP && _lbZoom.scale > ZOOM_MIN) {
        _lbResetZoom(true)
      }
    }




	if (_lbPanActive && e.touches.length === 0) {
		_lbPanActive = false
		if (_lbZoom.scale < ZOOM_SNAP) {
			_lbResetZoom(true)
		}
	}


	if (_lbSwipeActive && e.touches.length === 0 && !_lbPinchActive && !_lbPanActive && _lbZoom.scale === 1) {
		_lbSwipeActive = false
		const deltaX = e.changedTouches[0].clientX - _lbSwipeStartX
		const deltaY = e.changedTouches[0].clientY - _lbSwipeStartY
		const dt = Date.now() - _lbSwipeLastTime
		const velocity = dt > 0 ? Math.abs(_lbSwipeLastX - _lbSwipeStartX) / dt : 0
		const thumb = $('#lightboxThumb')
		const lb = $('#lightbox')


 const swipeH = window.innerWidth <= 768 ? 65 : 80
 const swipeV = window.innerWidth <= 768 ? 65 : 100
 if (Math.abs(deltaX) > swipeH || (Math.abs(deltaX) > 50 && velocity > 0.5)) {
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
   const dir = deltaX > 0 ? 1 : -1
			if (thumb) {
					thumb.style.transition = 'transform 0.2s cubic-bezier(0.22,1,0.36,1)'
					thumb.style.transform = `${_lbT} translateX(${dir * window.innerWidth}px) scale(0.9)`
				}
				if (lb) lb.style.transition = 'background-color 0.2s ease'
				setTimeout(() => {
					_lbSwipeResetVisuals()
					navigateLightbox(deltaX > 0 ? -1 : 1)
				}, 200)
  } else {
   _lbSwipeSpringBack()
  }

 } else if (deltaY > swipeV && deltaY > Math.abs(deltaX)) {
			if (thumb) {
				thumb.style.transition = 'transform 0.25s cubic-bezier(0.22,1,0.36,1)'
				thumb.style.transform = `${_lbT} translateY(${window.innerHeight}px) scale(0.8)`
			}
			if (lb) lb.style.transition = 'background-color 0.25s ease'
			setTimeout(() => {
				_lbSwipeResetVisuals()
				closeLightbox()
			}, 250)
	} else {
		_lbSwipeSpringBack()
	}
}




    const now = Date.now()
    const tapX = e.changedTouches[0].clientX
    const tapY = e.changedTouches[0].clientY
    if (now - _lbLastTapTime < 300 && Math.abs(tapX - _lbLastTapX) < 30 && Math.abs(tapY - _lbLastTapY) < 30) {
      const rel = _lbRelCenter(tapX, tapY)
      if (_lbZoom.scale > 1) {
        _lbResetZoom(true)
      } else {
        _lbZoomTo(ZOOM_DOUBLE_TAP, rel.x, rel.y, true)
      }
      _lbTouchDoubleTapAt = Date.now()           
      _lbLastTapTime = 0                        
    } else {
      _lbLastTapTime = now
      _lbLastTapX = tapX
      _lbLastTapY = tapY
    }


    if (_lbTouchTimer) clearTimeout(_lbTouchTimer)
    _lbTouchTimer = setTimeout(() => {
      if (prevBtn) prevBtn.style.opacity = ''
      if (nextBtn) nextBtn.style.opacity = ''
      _lbTouchTimer = null
    }, 1500)
  }, { passive: true })
}
