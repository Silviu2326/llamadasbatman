export function simulate(input) {
  const costPerCall = input.costPerMinute * input.minutesPerCall
  const calls = costPerCall > 0 ? Math.floor(Math.max(0, input.budget) / costPerCall) : 0
  const conversations = calls * input.contact
  const qualified = conversations * input.qualify
  const opportunities = qualified * input.opportunity
  const sales = opportunities * input.win
  const revenue = sales * input.dealValue
  return { calls, conversations, qualified, opportunities, sales, revenue,
    profit: revenue - input.budget,
    roi: input.budget > 0 ? revenue / input.budget : 0,
    costPerSale: sales >= 0.1 ? input.budget / sales : null,
    minutes: Math.round(calls * input.minutesPerCall),
  }
}

export function reversePlan(target, params, minutesAllowed) {
  if (!Number.isFinite(target) || target <= 0 || !params) return null
  if (['dealValue', 'win', 'opportunity', 'qualify', 'contact', 'costPerMinute', 'minutesPerCall'].some(key => !Number.isFinite(params[key]) || params[key] <= 0)) return null
  const sales = target / params.dealValue
  const opportunities = sales / params.win
  const qualified = opportunities / params.opportunity
  const conversations = qualified / params.qualify
  const calls = Math.ceil(conversations / params.contact)
  const minutes = Math.ceil(calls * params.minutesPerCall)
  return { sales, opportunities, qualified, conversations, calls, minutes,
    budget: Math.ceil(calls * params.minutesPerCall * params.costPerMinute), fits: minutes <= minutesAllowed }
}
