import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// This route is no longer used — payment now redirects to a Moyasar-hosted
// Invoice page via the Invoices API. Redirect any stale bookmarks to billing.
export default function PaymentCheckout() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/dashboard/billing', { replace: true })
  }, [navigate])
  return null
}
