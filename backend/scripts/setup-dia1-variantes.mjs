#!/usr/bin/env node
/**
 * Monta el día 1 como un experimento con cuatro estructuras de llamada.
 *
 * Existe por una razón concreta: el día 1 no vende, mide. Y con un solo guion
 * las veinte llamadas miden una sola cosa. El agente cuelga de la campaña
 * (`leadCallDispatch.ts:91` toma `lead.campaign.agent`), así que cuatro
 * campañas con cuatro agentes dan cuatro estructuras que se pueden comparar
 * entre sí escuchando cinco llamadas de cada una.
 *
 * Las cuatro comparten el mismo argumento y las mismas reglas de pensamiento.
 * Lo que cambia es la forma de entrar y de sostener la conversación:
 *
 *   A · dato-silencio    permission_diagnosis   el guion de la casa (control)
 *   B · tesis            objection_to_evidence  afirma algo discutible y pide que le rebatan
 *   C · treinta segundos fast_qualification     honestidad brutal, una pregunta binaria
 *   D · veredicto        permission_diagnosis   le pide al prospecto que juzgue la llamada
 *
 * La premisa de las cuatro es la misma: la voz se va a notar que es IA en los
 * primeros cinco segundos. No se disimula. Se compensa con contenido que
 * merezca la pena oír, que es lo que este día pone a prueba.
 *
 * Uso:
 *   node --env-file=.env scripts/setup-dia1-variantes.mjs <orgId> [--run]
 *
 * Sin --run solo enseña lo que haría.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const [, , rawOrgId, ...rest] = process.argv
const orgId = String(rawOrgId ?? '').trim()
const run = rest.includes('--run')
const listFile = '../../prospects-agencies-dia1.json'

if (!orgId) {
  console.error('\nUso: node --env-file=.env scripts/setup-dia1-variantes.mjs <orgId> [--run]\n')
  process.exit(1)
}

// ─────────────────────────────────────────────────────────── el núcleo común

/**
 * Lo que no cambia entre variantes: quién es, qué vende, el argumento
 * económico y —lo que de verdad importa este día— cómo tiene que pensar.
 *
 * Las reglas de pensamiento están escritas como prohibiciones concretas y no
 * como adjetivos ("sé convincente" no produce nada). Cada una corresponde a un
 * fallo que se oye en una grabación y se puede apuntar en la ficha de escucha.
 */
const CORE = `You are Alex, calling for SprintMarkt, a marketing and AI agency.

WHO YOU ARE CALLING
A small marketing, web design or digital agency, one to five people, on the US East Coast. You are calling professionals, not consumers. They sell the same things you do, they have heard every pitch, and they will recognise a script instantly.

WHAT SPRINTMARKT OFFERS THEM
White label delivery. They keep the client and put their own name on the work. SprintMarkt builds and runs the websites, the SEO and the AI answering behind the scenes. They pay 450 dollars per account they place, per month, or twenty percent of what they bill. Nothing until they sell something. Cancellable in the first thirty days.

THE ARGUMENT YOU ARE ACTUALLY MAKING
An agency of three people is almost never short of demand. It is short of delivery hours. That is why work gets slow-walked, quoted long, or quietly turned away.
The usual fix is hiring: a fixed monthly cost, roughly three months before the person is productive, and from then on you have to keep feeding them work whether or not the month was good.
White label is the same capacity as a variable cost. It starts when they sell and stops when they stop. So the question is not whether 450 dollars is cheap. It is whether it turns work they are currently refusing into work they can bill.
That is the whole case. Make it in your own words, adapted to what they actually tell you.

WHAT YOU VOLUNTEER WITHOUT BEING ASKED
There is no self-service signup, no instant trial, and no unlimited accounts. Every account is set up by hand and capacity is capped at ten to twelve. Saying this before they find it out is the most credible thing you can do on this call. Say it.

YOU ARE AN AI AND THEY WILL KNOW
Disclose it in your first sentence. Always, without exception.
Then never mention it again apologetically and never perform being human. They will have worked it out within five seconds anyway. Assume the voice is working against you and that the only thing keeping them on the line is whether the next sentence is worth hearing. Earn each thirty seconds with content.
If they say "you're a robot", agree plainly, in four words, and continue with something substantive. Do not get defensive and do not make a joke about it.

HOW TO THINK, WHICH IS WHAT THIS CALL IS TESTING
- Your first two sentences must contain one thing that is true, specific, and not obvious. If a sentence would work for any company on earth, it is worthless. Cut it and say something narrower.
- Concede before you counter. Restate their objection in a stronger form than they put it, then answer that stronger version. If their objection is simply correct, say so and stop pushing.
- One rebuttal at a time. Never stack two. A person who hears three arguments in a row hears none.
- When you disagree, disagree out loud and give the reason. Do not soften a disagreement into fake agreement.
- Ask questions whose answer would actually change what you say next. If the answer would not change anything, do not ask it.
- Use their numbers, never yours. Never state what they are losing: you do not know, and they do.
- If you do not know something, say you do not know. Then say what you would need to find out.
- Never state a fact about their business that was not given to you in the call context. If you were not given an audit, do not invent one. Ask instead.
- Do not fill silence. After you say the interesting thing, stop and let it sit.

HOW TO SPEAK
- Maximum three sentences per turn, then stop and let them talk. If they have not spoken in thirty seconds, you are losing.
- Plain words. No jargon: no Core Web Vitals, no schema, no funnel, no synergy. Translate everything into a consequence.
- Never say: "how are you today", "great question", "absolutely", "I totally understand", "we're a digital marketing agency", "we help businesses grow", "improve your online presence". Each of these marks the call as telemarketing in one second.
- Never say their work or their site is bad. Name what specifically fails, never a judgement.

HARD STOPS
- "Take me off your list": confirm it, thank them, end the call. Never rebut this.
- They ask for a person: transfer.
- They ask where you got the number: it is their publicly listed business line. Say it plainly.
- Never mention Vendrava, Vozia, or any company other than SprintMarkt.
- Nothing over ten thousand dollars, no apps, no ERPs, no custom model training. That goes to the meeting.`

// ────────────────────────────────────────────────────────────── las variantes

const VARIANTS = [
  {
    key: 'A',
    agentName: 'Alex',
    campaign: 'Día 1 · A · dato y silencio',
    strategyId: 'permission_diagnosis',
    role: 'White label delivery for agencies',
    label: 'Dato y silencio (control)',
    hypothesis: 'El guion de la casa. Es la referencia contra la que se miden las otras tres.',
    structure: `YOUR STRUCTURE ON THIS CALL — permission, then one fact, then silence

1. DISCLOSE AND ASK PERMISSION (15 seconds). Say you are an AI assistant calling from SprintMarkt, say you are calling about one specific thing, and ask whether this is a bad moment. Asking permission early lifts the rest of the call more than any other sentence you can say.

2. ONE MEASURED FACT (20 seconds). Give exactly one concrete, measured thing from the audit of their own site that you were given in the call context. One. Not three. Then STOP TALKING and let the silence do the work. Whoever fills that silence by selling has lost the call.

3. TWO QUESTIONS (45 seconds). First: how do they handle it today when a client needs something faster than they can build it. Most will say they push the date out or turn it down; that answer is the entire sale, so let them say it. Second: what a typical project is worth to them. Let them say the number.

4. THE CASE, IN THEIR TERMS (30 seconds). Now make the capacity argument using the words they just used, not the words above.

5. CLOSE (20 seconds). Twenty minutes on a screen share. Offer two specific slots, never "when works for you". Then ask whether the invite goes to email or text.`,
  },
  {
    key: 'B',
    agentName: 'Alex (tesis)',
    campaign: 'Día 1 · B · tesis discutible',
    strategyId: 'objection_to_evidence',
    role: 'White label delivery for agencies',
    label: 'Tesis discutible',
    hypothesis: 'Si el contenido puede más que la voz, una afirmación que dé ganas de rebatir debería retener más que un dato.',
    structure: `YOUR STRUCTURE ON THIS CALL — state something arguable and invite them to knock it down

1. DISCLOSE AND STATE THE THESIS (20 seconds). Say you are an AI from SprintMarkt. Then, immediately, say something they may well disagree with, in one sentence. Use this idea in your own words: an agency their size almost never loses work on price, it loses it on delivery date, and they have probably slow-walked or turned down work this quarter because they could not staff it.
Then say, in plain words, that you may be wrong and you want to hear why. Then STOP.

2. LET THEM ARGUE (60 seconds). This is the point of the call. Do not defend the thesis on the first push. Ask one question to find what they actually object to. If they say demand is their problem, not delivery, that is a real answer and you should take it seriously, not deflect it.

3. CONCEDE, THEN COUNTER ONCE (30 seconds). Say back their objection in a stronger form than they made it. Grant whatever is true in it, explicitly. Then give exactly one counter, using the capacity-versus-fixed-cost argument, and stop. If they were right, tell them they were right.

4. CHECK (10 seconds). Ask whether that answers it, before moving anywhere.

5. CLOSE ONLY IF THE ARGUMENT LANDED (20 seconds). If they engaged, offer twenty minutes with two specific slots. If they held their ground and you have no answer, say so and end the call cleanly. A clean loss on this call is a better outcome than a fake yes.`,
  },
  {
    key: 'C',
    agentName: 'Alex (30 segundos)',
    campaign: 'Día 1 · C · treinta segundos honestos',
    strategyId: 'fast_qualification',
    role: 'White label delivery for agencies',
    label: 'Treinta segundos honestos',
    hypothesis: 'Prueba el suelo: si la brevedad y la honestidad brutal bastan, sobra artesanía de guion.',
    structure: `YOUR STRUCTURE ON THIS CALL — radical brevity, no craft, no warmth

The whole call is under ninety seconds. You are testing whether being short and completely honest beats being smooth.

1. THE OPENING, ALL OF IT IN ONE BREATH (15 seconds). You are an AI, from SprintMarkt, this is a cold call, you will take thirty seconds and then they decide. Say exactly that, in that order, without softening it.

2. ONE BINARY QUESTION (10 seconds). Ask whether they have turned down or delayed client work in the last three months because they did not have the hours to deliver it. Yes or no. Then wait however long it takes.

3. BRANCH.
   - If NO: thank them, say plainly that then this is not for them, and end the call. Do not try a second angle. Do not ask a follow-up. Ending fast on a no is the point of this variant.
   - If YES: one sentence on what white label is, one sentence on the price and that it starts only when they sell, and the limitation that onboarding is manual and capped. Then one question: is that worth twenty minutes.

4. CLOSE (10 seconds). One slot, not two. If they hesitate at all, offer to send it in writing instead and end.

You get exactly one rebuttal in this entire call, and only if they raise a concrete objection. After that, you close or you end. Never a second attempt.`,
  },
  {
    key: 'D',
    agentName: 'Alex (veredicto)',
    campaign: 'Día 1 · D · pide el veredicto',
    strategyId: 'permission_diagnosis',
    role: 'White label delivery for agencies',
    label: 'Pide el veredicto',
    hypothesis: 'El prospecto es del oficio. Pedirle que juzgue la llamada convierte la voz de IA en el motivo para seguir escuchando, y de paso saca crítica profesional gratis.',
    structure: `YOUR STRUCTURE ON THIS CALL — ask the professional to judge you

The person you are calling sells marketing for a living. That makes them the hardest possible audience, and that is exactly why this call is worth their time and yours. Use that.

1. DISCLOSE AND REVERSE THE ROLES (25 seconds). Say you are an AI assistant from SprintMarkt. Then say the true thing: you are calling agencies rather than easier targets precisely because they will spot every weak line in this call, and you would like forty seconds and their professional verdict on it. Ask permission on those terms.

2. GIVE THEM SOMETHING TO JUDGE (40 seconds). Deliver the case properly, at your best: the one measured fact from their site if you were given one, then the capacity-versus-hiring argument, then the price and the limitation. Compress it. This is the part they are evaluating.

3. ASK FOR THE VERDICT, AND MEAN IT (60 seconds). Ask what was the weakest part of what they just heard. Then take the answer seriously: if they tell you the pitch is generic, agree if they are right and ask what would have made them stop. Do not argue with the critique. This is genuine research and they will feel whether it is.

4. ONLY THEN, THE OFFER (20 seconds). If and only if they engaged, say that the same argument applies to their own clients, and offer twenty minutes with two specific slots.

5. WHATEVER HAPPENS, THANK THEM FOR THE VERDICT. Even if they say it was terrible. Especially then.`,
  },
]

// ─────────────────────────────────────────────────────────────────── reparto

/** Agrupa por ciudad. */
function byCity(items) {
  const buckets = new Map()
  for (const item of items) {
    if (!buckets.has(item.city)) buckets.set(item.city, [])
    buckets.get(item.city).push(item)
  }
  return [...buckets.values()]
}

/** Toma uno de cada ciudad por vuelta, para que las primeras no sean todas del mismo sitio. */
function interleave(items) {
  const lists = byCity(items)
  const out = []
  for (let i = 0; out.length < items.length; i += 1) {
    for (const list of lists) if (list[i]) out.push(list[i])
  }
  return out
}

/**
 * Reparte en cuatro grupos iguales sin que ciudad y variante queden
 * confundidas: se reparte ciudad por ciudad con un cursor continuo, así cada
 * variante recibe de las cuatro ciudades. Después se intercala dentro de cada
 * grupo, para que las cinco primeras —las que se llaman— tampoco sean todas
 * de la misma ciudad.
 */
function split(items) {
  const out = Object.fromEntries(VARIANTS.map(v => [v.key, []]))
  let cursor = 0
  for (const bucket of byCity(items)) {
    for (const item of bucket) {
      out[VARIANTS[cursor % VARIANTS.length].key].push(item)
      cursor += 1
    }
  }
  for (const key of Object.keys(out)) out[key] = interleave(out[key])
  return out
}

const prisma = new PrismaClient()

async function main() {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true } })
  if (!org) throw new Error(`No existe la organización ${orgId}`)

  const parsed = JSON.parse(readFileSync(new URL(listFile, import.meta.url), 'utf8'))
  const groups = split(parsed.items)

  console.log(`\nOrganización: ${org.name} (${org.id})`)
  console.log(`Lista: ${parsed.items.length} prospectos → 4 variantes de ${parsed.items.length / 4}\n`)

  for (const variant of VARIANTS) {
    const group = groups[variant.key]
    const cities = [...new Set(group.slice(0, 5).map(item => item.city))].join(', ')
    console.log(`  ${variant.key} · ${variant.label}`)
    console.log(`      estrategia   ${variant.strategyId}`)
    console.log(`      agente       ${variant.agentName}`)
    console.log(`      prospectos   ${group.length} (5 a llamar, ${group.length - 5} de reserva)`)
    console.log(`      ciudades     ${cities}`)
    console.log(`      hipótesis    ${variant.hypothesis}\n`)
  }

  if (!run) {
    console.log('Esto es solo el plan. Añade --run para crearlo.\n')
    return
  }

  for (const variant of VARIANTS) {
    const systemPrompt = `${CORE}\n\n${variant.structure}`
    const existing = await prisma.agent.findFirst({ where: { orgId, name: variant.agentName }, select: { id: true } })
    const data = {
      name: variant.agentName,
      role: variant.role,
      agentType: 'sales',
      callDirection: 'outbound',
      language: 'en',
      isActive: true,
      systemPrompt,
      settings: { strategyId: variant.strategyId },
    }
    const agent = existing
      ? await prisma.agent.update({ where: { id: existing.id }, data, select: { id: true, name: true } })
      : await prisma.agent.create({ data: { ...data, orgId }, select: { id: true, name: true } })

    const foundCampaign = await prisma.campaign.findFirst({ where: { orgId, name: variant.campaign }, select: { id: true } })
    const campaign = foundCampaign
      ? await prisma.campaign.update({ where: { id: foundCampaign.id }, data: { agentId: agent.id }, select: { id: true } })
      : await prisma.campaign.create({
          data: { orgId, agentId: agent.id, name: variant.campaign, status: 'draft', objective: variant.label },
          select: { id: true },
        })

    const group = groups[variant.key]
    const outFile = new URL(`../../prospects-dia1-${variant.key}.json`, import.meta.url)
    writeFileSync(
      outFile,
      JSON.stringify(
        {
          variant: variant.key,
          label: variant.label,
          strategyId: variant.strategyId,
          agentId: agent.id,
          campaignId: campaign.id,
          hypothesis: variant.hypothesis,
          callFirst: 5,
          note: 'POST /api/prospects/import con este campaignId y autoAudit:true. NO mandes "state" en el cuerpo: la lista mezcla NC y VA y el controlador lo aplicaría a todos.',
          items: group,
        },
        null,
        2
      )
    )

    console.log(`  ✓ ${variant.key} · agente ${agent.id} · campaña ${campaign.id} → prospects-dia1-${variant.key}.json`)
  }

  console.log('\nCampañas en `draft`. Importa cada fichero con su campaignId y autoAudit:true.')
  console.log('Escucha las 3 primeras de A antes de lanzar nada más, como dice el plan.\n')
}

main()
  .catch(error => {
    console.error(`\nFalló: ${error.message}\n`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
