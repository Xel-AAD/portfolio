let portfolioData = null
let currentLightboxList = []
let currentLightboxIndex = -1
let isGalleryPage = false

export function getPortfolioData() { return portfolioData }
export function setPortfolioData(data) { portfolioData = data }

export function getLightboxList() { return currentLightboxList }
export function setLightboxList(list) { currentLightboxList = list }

export function getLightboxIndex() { return currentLightboxIndex }
export function setLightboxIndex(idx) { currentLightboxIndex = idx }

export function getIsGalleryPage() { return isGalleryPage }
export function setIsGalleryPage(val) { isGalleryPage = val }
