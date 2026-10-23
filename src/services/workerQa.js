import { workerRpc } from '@/services/workerRpc'

/**
 * Resolve a scanned Dearune QR.
 *
 * The server validates the public id and, when supplied, the token. It returns
 * the safe project/unit record only; the letter payload, sale price, cost,
 * profit and public token are never part of the response.
 */
export async function fetchWorkerQaRecord(publicId, token = '') {
  return workerRpc('worker_qa_lookup', {
    p_public_id: publicId,
    p_token: token || '',
  })
}
