// Google Drive export — one button, sends everything for the current sport
// to a sport-specific subfolder in Drive, so it's readable by Claude directly
// (via the Drive connector) in any conversation, no copy/paste needed.
//
// SETUP REQUIRED before this does anything (one-time, per Google account):
// 1. console.cloud.google.com -> new project -> enable "Google Drive API"
// 2. OAuth consent screen -> External -> app name + your email -> Test users:
//    add your own email (apps in "Testing" mode only work for whitelisted
//    accounts, including the developer's own -- this is normal and fine to
//    leave permanently for a personal single-user tool)
// 3. Credentials -> Create Credentials -> OAuth client ID -> Web application
// 4. Authorized JavaScript origins: add your deployed URL exactly
//    (e.g. https://betlab-tracker.vercel.app -- no trailing slash)
// 5. Paste the resulting Client ID below.

const CLIENT_ID = '970334634113-55oun78htt9dl4lud35k5lb3cgb4q7gi.apps.googleusercontent.com'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const ROOT_FOLDER_NAME = 'BetLab Sharp Data'

let accessToken = null
let gisLoaded = false

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

function requestToken() {
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
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

async function driveFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`)
  return res.json()
}

async function findFolder(name, parentId) {
  const parentClause = parentId ? ` and '${parentId}' in parents` : ''
  const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`)
  const data = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}`)
  return data.files?.[0]?.id || null
}

async function createFolder(name, parentId) {
  const body = { name, mimeType: 'application/vnd.google-apps.folder' }
  if (parentId) body.parents = [parentId]
  const created = await driveFetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return created.id
}

async function getOrCreateFolder(name, parentId) {
  const existing = await findFolder(name, parentId)
  if (existing) return existing
  return createFolder(name, parentId)
}

async function findFile(name, parentId) {
  const q = encodeURIComponent(`name='${name}' and '${parentId}' in parents and trashed=false`)
  const data = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}`)
  return data.files?.[0]?.id || null
}

// One button: connects if needed (real Google sign-in popup, must be called
// from a user click), then uploads the FULL current export -- active +
// archived, everything -- for one sport into "BetLab Sharp Data/{SPORT}/".
// Overwrites the same rolling file each time (it's always a full snapshot,
// not incremental), so Drive doesn't fill up with near-duplicate exports.
export async function exportToDrive(sport, exportObj) {
  if (!isConfigured()) throw new Error('Not set up yet — add your Client ID in driveSync.js')
  if (!accessToken) {
    await loadGis()
    await requestToken()
  }

  const rootId = await getOrCreateFolder(ROOT_FOLDER_NAME, null)
  const sportFolderId = await getOrCreateFolder(sport.toUpperCase(), rootId)

  const filename = `${sport}-export.json`
  const content = JSON.stringify({ ...exportObj, exportedAt: new Date().toISOString() }, null, 2)
  await uploadFile(filename, content, sportFolderId)
}

async function uploadFile(filename, content, parentId) {
  const existingId = await findFile(filename, parentId)
  const boundary = 'betlab_boundary'
  const metadata = existingId ? { name: filename } : { name: filename, parents: [parentId] }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`

  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`

  const res = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// Sends just ONE archived day, not the whole history -- avoids re-uploading
// everything every time. Lands in a "days" subfolder so it never collides
// with the full-snapshot export file. Auto-called from Archive Day; connects
// on first use if not already connected (must be triggered from a real click
// for the OAuth popup to work, which Archive Day already is).
export async function syncDayToDrive(sport, day) {
  if (!isConfigured()) return { skipped: 'not configured' }
  if (!accessToken) {
    await loadGis()
    await requestToken()
  }

  const rootId = await getOrCreateFolder(ROOT_FOLDER_NAME, null)
  const sportFolderId = await getOrCreateFolder(sport.toUpperCase(), rootId)
  const daysFolderId = await getOrCreateFolder('days', sportFolderId)

  const filename = `${sport}-${day.date.replace(/\s+/g, '-')}.json`
  const content = JSON.stringify({ sport, ...day, syncedAt: new Date().toISOString() }, null, 2)
  return uploadFile(filename, content, daysFolderId)
}
