import { useEffect, useState } from "react"
import { datasetsRepo } from "~src/lib/datasetsRepo"





function useTabBoot() {
  const [status, setStatus] = useState<"init" | "ready" | "error">("init")
  const [error, setError] = useState<string | null>(null)
  const [datasetId, setDatasetId] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const ds = await datasetsRepo.ensureScoped()
        setDatasetId(ds.id)
        setStatus("ready")
      } catch (e) {
        console.error(e)
        setError(String(e))
        setStatus("error")
      }
    })()
  }, [])

  return { status, error, datasetId }
}

export default useTabBoot
