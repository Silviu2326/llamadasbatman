export function whatsappOptOut(text: string): boolean {
  const value = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  return /^(stop|baja|unsubscribe|cancelar)[.! ]*$/.test(value)
    || /\b(no me (escribas|escriban|contactes|contacten|llames|llamen)|no quiero (mas mensajes|que me contacten)|elimina mi numero|borra mi numero|remove me|do not contact|don't contact)\b/.test(value)
}

export function whatsappWindowOpen(lastInbound: Date | string | null | undefined, now = Date.now()) {
  const date = lastInbound ? new Date(lastInbound).getTime() : 0
  return Number.isFinite(date) && date > 0 && date <= now && now - date < 24 * 60 * 60 * 1000
}

export function canAutomaticallyReply(conversation: { status: string; assignedUserId?: string | null; metadata?: any }) {
  return conversation.status === 'open' && !conversation.assignedUserId && conversation.metadata?.aiPaused !== true
}
