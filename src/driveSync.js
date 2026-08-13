// Google Drive sync — sends a copy of each archived day to the user's Drive
// so it's readable from outside the browser (by Claude, in any conversation,
// via the Drive connector) rather than living only in localStorage.
//
// SETUP REQUIRED before this does anything:
// 1. console.cloud.google.com -> new project -> enable "Google Drive API"
// 2. OAuth consent screen -> External -> fill in app name + your email
// 3. Credentials -> Create Credentials -> OAuth client ID -> Web application
// 4. Authorized JavaScript origins: add your deployed URL
//    (e.g. https://betlab-tracker.vercel.app)
// 5. Paste the resulting Client ID below.

const CLIENT_ID = '970334634113-55oun78htt9dl4lud35k5lb3cgb4q7gi.apps.googleusercontent.com'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER_NAME = 'BetLab Sharp Data'

let tokenClient = null
let accessToken = null
let gisLoaded = false

// Loads Google's Identity Services script once, on demand.
function loadGis() {
  return new Promise((resolve, reject) => {
    if (gisLoaded && window.google?.accounts?.oauth2) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => { gisLoaded = true; resolve() }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export function isConfigured() {
  return CLIENT_ID && !CLIENT_ID.startsWith('PASTE_')
}

export function isConnected() {
  return !!accessToken
}

// Opens Google's sign-in popup. Must be called from a real user click
// (browsers block popups triggered outside a click handler).
export async function connect() {
  if (!isConfigured()) throw new Error('Drive sync not configured yet — add your Client ID in driveSync.js')
  await loadGis()
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(resp); return }
        accessToken = resp.access_token
        resolve(resp)
      },
    })
    tokenClient.requestAccessToken()
  })
}

let cachedFolderId = null

async function getOrCreateFolder() {
  if (cachedFolderId) return cachedFolderId
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const searchData = await searchRes.json()
  if (searchData.files?.length) { cachedFolderId = searchData.files[0].id; return cachedFolderId }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  const created = await createRes.json()
  cachedFolderId = created.id
  return cachedFolderId
}

// Uploads one archived day as its own JSON file, named so Claude can find it
// via a simple Drive search (e.g. "betlab-sharp-mlb-2026-08-12").
export async function syncDayToDrive(sport, day) {
  if (!isConfigured()) return { skipped: 'not configured' }
  if (!accessToken) return { skipped: 'not connected' }

  const folderId = await getOrCreateFolder()
  const isoDate = day.date // caller passes an ISO-ish safe filename date
  const filename = `betlab-sharp-${sport}-${isoDate}.json`
  const content = JSON.stringify({ sport, ...day }, null, 2)

  // Check if a file with this name already exists in the folder (re-archiving
  // the same day should overwrite, not duplicate).
  const q = encodeURIComponent(`name='${filename}' and '${folderId}' in parents and trashed=false`)
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const searchData = await searchRes.json()
  const existingId = searchData.files?.[0]?.id

  const metadata = existingId
    ? { name: filename }
    : { name: filename, parents: [folderId] }

  const boundary = 'betlab_boundary'
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`

  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`

  const res = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive upload failed: ${res.status} ${err}`)
  }
  return await res.json()
}
