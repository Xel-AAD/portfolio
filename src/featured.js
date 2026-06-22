


import { $ } from './dom.js'
import { setLightboxList } from './state.js'
import { openLightbox } from './lightbox.js'

export function renderFeatured() {
  const photos = window.__LIGHTBOX_DATA__
  if (!photos?.length) return

  const grid = $('#featuredGrid')
  if (!grid) return
  grid.innerHTML = ''

  const style = getComputedStyle(grid)
  const containerWidth = grid.clientWidth
  - parseFloat(style.paddingLeft)
  - parseFloat(style.paddingRight)

  const gap = 10
  const isMobile = window.innerWidth <= 768
  const colCount = isMobile ? 2 : 3
  const colWidth = (containerWidth - (colCount - 1) * gap) / colCount

  const columns = Array.from({ length: colCount }, () => ({
    el: null,
    height: 0,
    items: [],
    imgHeights: []
  }))

  for (let i = 0; i < colCount; i++) {
    const colEl = document.createElement('div')
    colEl.className = 'featured__col'
    colEl.style.width = `${colWidth}px`
    columns[i].el = colEl
    grid.appendChild(colEl)
  }

  photos.forEach((photo, idx) => {
    const w = photo.width || 3
    const h = photo.height || 4
    const imgHeight = colWidth * (h / w)

    const shortest = columns.reduce((min, col, i) => col.height < columns[min].height ? i : min, 0)

    const itemEl = document.createElement('div')
    itemEl.className = 'featured__item anim-fade-up'
    itemEl.style.marginBottom = `${gap}px`

  const img = document.createElement('img')
  img.src = photo.src.replace('/photos/', '/photos/thumbs/')
  img.srcset = `${photo.src.replace('/photos/', '/photos/mobile/')} 300w, ${photo.src.replace('/photos/', '/photos/thumbs/')} 800w`
  img.sizes = `${Math.round(colWidth)}px`
  img.alt = photo.title
  img.loading = 'lazy'
  img.width = Math.round(colWidth)
  img.height = Math.round(imgHeight)

    const overlay = document.createElement('div')
    overlay.className = 'featured__item-overlay'

    const title = document.createElement('h3')
    title.className = 'featured__item-title'
    title.textContent = photo.title

    overlay.appendChild(title)
    itemEl.appendChild(img)
    itemEl.appendChild(overlay)

  itemEl.addEventListener('click', () => {
    setLightboxList(photos)
    openLightbox(idx)
  })

  let _overlayTimer = null
  itemEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return
    const overlay = itemEl.querySelector('.featured__item-overlay')
    if (!overlay) return
    overlay.classList.remove('featured__item-overlay--show')
    void overlay.offsetWidth
    overlay.classList.add('featured__item-overlay--show')
    if (_overlayTimer) clearTimeout(_overlayTimer)
    _overlayTimer = setTimeout(() => {
      overlay.classList.remove('featured__item-overlay--show')
      _overlayTimer = null
    }, 3000)
  })

    columns[shortest].el.appendChild(itemEl)
    columns[shortest].height += imgHeight + gap
    columns[shortest].items.push(itemEl)
    columns[shortest].imgHeights.push(imgHeight)
  })

  const maxH = Math.max(...columns.map(c => c.height))
  for (const col of columns) {
    if (col.items.length === 0) continue
    const diff = maxH - col.height
    if (diff > 2) {
      const last = col.items[col.items.length - 1]
      const lastImg = last.querySelector('img')
      const origH = col.imgHeights[col.imgHeights.length - 1]
      const newH = origH + diff
      lastImg.style.height = `${newH}px`
      lastImg.style.objectFit = 'cover'
      lastImg.height = Math.round(newH)
    }
  }
}
