// Keep API calls on /api; the Vite or production server proxy selects the backend target.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

let activeApiRequests = 0
const apiRequestListeners = new Set<() => void>()

function updateActiveApiRequests(change: number) {
  activeApiRequests = Math.max(0, activeApiRequests + change)
  apiRequestListeners.forEach(listener => listener())
}

export function subscribeToApiRequests(listener: () => void) {
  apiRequestListeners.add(listener)
  return () => apiRequestListeners.delete(listener)
}

export function getActiveApiRequestCount() {
  return activeApiRequests
}

function apiUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (base.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${base}${normalizedPath.slice(4)}`
  }

  return `${base}${normalizedPath}`
}
export class ApiError extends Error {
  status: number
  details: unknown

  constructor(status: number, message: string, details: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export function currentUserHeaders(): Record<string, string> {
  const userId = import.meta.env.VITE_CURRENT_USER_ID || localStorage.getItem('currentUserId') || 'INF_SD02'
  const userEmail = import.meta.env.VITE_CURRENT_USER_EMAIL || localStorage.getItem('currentUserEmail') || ''
  const userName = import.meta.env.VITE_CURRENT_USER_NAME || localStorage.getItem('currentUserName') || 'Avula Murali'

  return {
    'X-User-Id': userId,
    'X-User-Email': userEmail,
    'X-User-Name': userName,
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  updateActiveApiRequests(1)
  try {
    const response = await fetch(apiUrl(path), { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } })
    if (!response.ok) {
      let details: unknown = null
      let message = `Request failed (${response.status})`
      try {
        details = await response.json()
        if (typeof details === 'object' && details && 'message' in details && typeof (details as { message?: unknown }).message === 'string') {
          message = (details as { message: string }).message
        }
      } catch {
        const text = await response.text()
        if (text) message = text
      }
      throw new ApiError(response.status, message, details)
    }
    return await response.json() as T
  } finally {
    updateActiveApiRequests(-1)
  }
}
