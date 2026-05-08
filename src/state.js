let currentLightboxList = []
let currentLightboxIndex = -1

export function getLightboxList() { return currentLightboxList }
export function setLightboxList(list) { currentLightboxList = list }

export function getLightboxIndex() { return currentLightboxIndex }
export function setLightboxIndex(idx) { currentLightboxIndex = idx }
