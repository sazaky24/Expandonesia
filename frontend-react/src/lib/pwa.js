/**
 * Progressive-web-app glue: install prompt, online status and service worker
 * lifecycle (offline shell + "versi baru tersedia" refresh).
 */

import { useCallback, useEffect, useState } from 'react'

export function isSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  const { matchMedia } = window
  if (typeof matchMedia !== 'function') return false
  return (
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  )
}

export function isIosDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Chrome/Edge fire `beforeinstallprompt` when the app is installable; Safari has
 * no such API, so `canInstall` stays false there and the UI shows instructions.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const handlePrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
    }
    const handleInstalled = () => {
      setDeferredPrompt(null)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', handleInstalled)

    const query = window.matchMedia?.('(display-mode: standalone)')
    const handleDisplayChange = (event) => setInstalled(event.matches)
    query?.addEventListener?.('change', handleDisplayChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      query?.removeEventListener?.('change', handleDisplayChange)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable'
    deferredPrompt.prompt()
    try {
      const { outcome } = await deferredPrompt.userChoice
      return outcome // 'accepted' | 'dismissed'
    } catch {
      return 'dismissed'
    } finally {
      setDeferredPrompt(null)
    }
  }, [deferredPrompt])

  return { canInstall: Boolean(deferredPrompt), installed, promptInstall }
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}

export function useServiceWorker() {
  const [registration, setRegistration] = useState(null)
  const [needRefresh, setNeedRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Dev-server asset names are not stable, so the shell cache is production-only.
    if (!isSupported() || import.meta.env.DEV) return undefined

    let cancelled = false

    const track = (worker) => {
      if (!worker) return
      worker.addEventListener('statechange', () => {
        if (cancelled || worker.state !== 'installed') return
        if (navigator.serviceWorker.controller) setNeedRefresh(true)
        else setOfflineReady(true)
      })
    }

    const swPath = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker
      .register(swPath, { updateViaCache: 'none' })
      .then((reg) => {
        if (cancelled) return
        setRegistration(reg)
        if (reg.waiting && navigator.serviceWorker.controller) setNeedRefresh(true)
        track(reg.installing)
        reg.addEventListener('updatefound', () => track(reg.installing))
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || String(err))
      })

    const handleControllerChange = () => window.location.reload()
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    const waiting = registration?.waiting
    if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' })
    else window.location.reload()
  }, [registration])

  const clearCache = useCallback(async () => {
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }
      registration?.active?.postMessage({ type: 'CLEAR_CACHE' })
      return true
    } catch {
      return false
    }
  }, [registration])

  return {
    supported: isSupported(),
    registration,
    needRefresh,
    offlineReady,
    error,
    applyUpdate,
    clearCache,
  }
}
