import { PrismaClient } from '@prisma/client'
import { encryptToken } from './src/lib/tokenCrypto'
import { evaluateCampaign } from './src/services/adOptimizer.service'

const prisma = new PrismaClient()

async function main() {
  const metaAccount = await prisma.metaAdAccount.upsert({
    where: { orgId_metaAdAccountId: { orgId: 'seed-org', metaAdAccountId: 'act_fake_optimizer' } },
    update: { dailyBudgetCapCents: 1000, systemUserTokenEnc: encryptToken('FAKE'), status: 'connected' },
    create: {
      orgId: 'seed-org',
      metaAdAccountId: 'act_fake_optimizer',
      dailyBudgetCapCents: 1000,
      systemUserTokenEnc: encryptToken('FAKE'),
      status: 'connected',
    },
  })

  const campaign = await prisma.campaign.create({
    data: {
      orgId: 'seed-org',
      name: 'test-optimizer-campaign',
      status: 'active',
      metaAdSetId: 'fake_adset_1',
      adStatus: 'active',
    },
  })

  await prisma.adInsightSnapshot.create({
    data: {
      orgId: 'seed-org',
      campaignId: campaign.id,
      metaAdSetId: 'fake_adset_1',
      spendCents: 1500, // > cap de 1000
      impressions: 1000,
      clicks: 50,
      leadsCount: 2,
      costPerLeadCents: 750,
    },
  })

  console.log('Antes:', campaign.status, campaign.adStatus)
  await evaluateCampaign('seed-org', campaign.id)
  const after = await prisma.campaign.findUnique({ where: { id: campaign.id } })
  console.log('Después:', after?.status, after?.adStatus)

  // cleanup
  await prisma.adInsightSnapshot.deleteMany({ where: { campaignId: campaign.id } })
  await prisma.campaign.delete({ where: { id: campaign.id } })
  await prisma.metaAdAccount.delete({ where: { id: metaAccount.id } })
  console.log('cleanup ok')
}

main().catch(console.error).finally(() => prisma.$disconnect())
