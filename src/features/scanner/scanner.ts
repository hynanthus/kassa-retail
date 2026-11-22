import {
  Html5Qrcode,
  type Html5QrcodeCameraScanConfig,
  type QrcodeSuccessCallback,
  type QrcodeErrorCallback,
} from 'html5-qrcode'

export interface ScannerOptions {
  onScanSuccess?: (decodedText: string) => void
  onScanFailure?: (error: string) => void
}

export function scanBarcode(options: ScannerOptions): () => void {
  const { onScanSuccess, onScanFailure } = options

  const elementId = 'reader'
  const container = document.getElementById(elementId)
  if (!container) {
    console.error(`Scanner container #${elementId} not found`)
    onScanFailure?.(`Scanner container #${elementId} not found`)
    return () => {}
  }

  const html5Qrcode = new Html5Qrcode(elementId, false)

  const config: Html5QrcodeCameraScanConfig = {
    fps: 10,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0,
  }

  const successCallback: QrcodeSuccessCallback = (decodedText) => {
    onScanSuccess?.(decodedText)
  }

  const failureCallback: QrcodeErrorCallback = (errorMessage) => {
    onScanFailure?.(errorMessage)
  }

  let disposed = false
  let scanning = false

  const hardStop = () => {
    html5Qrcode
      .stop()
      .then(() => html5Qrcode.clear())
      .catch((err: unknown) => console.error('Failed to stop scanner:', err))
  }

  html5Qrcode
    .start(
      { facingMode: 'environment' },
      config,
      (decodedText, result) => {
        if (!disposed) successCallback(decodedText, result)
      },
      (errorMessage, error) => {
        if (!disposed) failureCallback(errorMessage, error)
      }
    )
    .then(() => {
      if (disposed) {
        // Камера успела запуститься уже после остановки — выключаем сразу.
        hardStop()
        return
      }
      scanning = true
    })
    .catch((error: unknown) => {
      console.error('Failed to start barcode scanner:', error)
      if (!disposed) onScanFailure?.(error instanceof Error ? error.message : 'Camera access failed')
    })

  // Возвращаем функцию остановки сканера
  return () => {
    if (disposed) return
    disposed = true
    try {
      if (scanning) {
        hardStop()
      }
    } catch (err) {
      console.error('Scanner stop error:', err)
    }
  }
}
