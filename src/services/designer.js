import { invokeFunction } from '@/lib/supabase'

const DESIGNER_TOKEN_KEY = 'dearune.designer.token'

export function getDesignerToken() {
  return localStorage.getItem(DESIGNER_TOKEN_KEY)
}

export function setDesignerToken(token) {
  localStorage.setItem(DESIGNER_TOKEN_KEY, token)
}

export function clearDesignerToken() {
  localStorage.removeItem(DESIGNER_TOKEN_KEY)
}

export async function designerLogin(code, passcode) {
  const session = await invokeFunction('designer-login', {
    method: 'POST',
    body: { code, passcode },
  })
  setDesignerToken(session.token)
  return session
}

export function fetchDesignerOrders(token) {
  return invokeFunction('designer-messages', { token })
}

export function fetchDesignerMessage(token, orderId) {
  return invokeFunction(`designer-message/${orderId}`, { token })
}

export function saveDesignerMessage(token, orderId, input) {
  return invokeFunction(`designer-message/${orderId}`, {
    method: 'PUT',
    token,
    body: input,
  })
}

export function publishDesignerMessage(token, orderId) {
  return invokeFunction(`designer-message/${orderId}`, {
    method: 'POST',
    token,
  })
}