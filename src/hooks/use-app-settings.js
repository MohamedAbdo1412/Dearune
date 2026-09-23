import { useCallback, useEffect, useState } from 'react'
import { fetchSettings, updateSettings as updateSettingsRequest } from '@/services/settings'

export function useAppSettings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchSettings()
      setSettings(result)
    } catch (cause) {
      setError(cause)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const updateSettings = useCallback(async (patch) => {
    await updateSettingsRequest(patch)
    await refresh()
  }, [refresh])

  return { settings, loading, error, refresh, updateSettings }
}