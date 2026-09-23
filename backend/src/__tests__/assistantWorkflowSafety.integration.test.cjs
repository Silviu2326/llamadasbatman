const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { req, stores, actor, reset } = require('./assistantWorkflowFixture.cjs');
const workflows = req('./src/services/assistantWorkflows.ts');
const routines = req('./src/services/assistantRoutines.ts');
const input = (extra = {}) => ({ objective: 'Buscar peluquerías para seguimiento', target: 'Peluquerías', location: 'Madrid', kind: 'clients', source: 'saved', maxResults: 5, maxSearches: 4, followUp: true, allowExternalReview: false, requestId: randomUUID(), ...extra });
beforeEach(reset);

test('pause preserves state, correction resumes, cancellation prevents progress', async () => {
  let run = await workflows.createAssistantRun(actor, input());
  run = await workflows.controlAssistantRun(actor, run.id, { action: 'pause', revision: run.revision });
  assert.equal((await workflows.advanceAssistantRun(actor, run.id)).status, 'paused');
  run = await workflows.controlAssistantRun(actor, run.id, { action: 'resume', revision: run.revision, target: 'Salones de belleza' });
  assert.equal(run.input.target, 'Salones de belleza');
  run = await workflows.controlAssistantRun(actor, run.id, { action: 'cancel', revision: run.revision });
  assert.equal((await workflows.advanceAssistantRun(actor, run.id)).status, 'cancelled');
  assert.equal(stores.task.length, 0);
});

test('another user cannot read a run and revoked membership cannot advance it', async () => {
  const run = await workflows.createAssistantRun(actor, input());
  stores.organizationMembership.push({ orgId: actor.orgId, userId: 'other-user', role: 'owner', status: 'active' });
  await assert.rejects(workflows.getAssistantRun({ ...actor, userId: 'other-user' }, run.id), { statusCode: 404 });
  stores.organizationMembership[0].status = 'inactive';
  await assert.rejects(workflows.advanceAssistantRun(actor, run.id), { statusCode: 403 });
});

test('concurrent advances claim only one step and stale reviews cannot overwrite selection', async () => {
  let run = await workflows.createAssistantRun(actor, input());
  await Promise.all([workflows.advanceAssistantRun(actor, run.id), workflows.advanceAssistantRun(actor, run.id)]);
  run = await workflows.getAssistantRun(actor, run.id);
  assert.equal(run.steps[0].status, 'completed');
  assert.equal(run.steps[1].status, 'pending');
  run = await workflows.advanceAssistantRun(actor, run.id);
  run = await workflows.advanceAssistantRun(actor, run.id);
  const review = { revision: run.revision, items: [] };
  await workflows.reviewAssistantRun(actor, run.id, review);
  await assert.rejects(workflows.reviewAssistantRun(actor, run.id, review), { statusCode: 409 });
  assert.equal(stores.task.length, 0);
});

test('business mismatch and external query limits fail before dispatching a paid job', async () => {
  let run = await workflows.createAssistantRun(actor, input({ kind: 'properties' }));
  run = await workflows.advanceAssistantRun(actor, run.id);
  assert.equal(run.status, 'failed');
  assert.match(run.error, /inmobiliario/);
  run = await workflows.createAssistantRun(actor, input({ source: 'web', allowExternalReview: true, maxSearches: 1 }));
  await workflows.advanceAssistantRun(actor, run.id);
  run = await workflows.advanceAssistantRun(actor, run.id);
  assert.equal(run.status, 'failed');
  assert.match(run.error, /límite/);
  assert.equal(stores.job.length, 0);
});

test('two scheduler instances reserve one run; a corrected paused objective stays recoverable', async () => {
  const routine = await routines.createAssistantRoutine(actor, { name: 'Radar semanal', input: input(), intervalHours: 168, startsAt: new Date(Date.now() + 3600000).toISOString(), maxRuns: 2, requestId: randomUUID() });
  await routines.setAssistantRoutineActive(actor, routine.id, true);
  const time = new Date(Date.now() + 7200000);
  await Promise.all([routines.dispatchAssistantRoutines(time), routines.dispatchAssistantRoutines(time)]);
  let saved = (await routines.listAssistantRoutines(actor))[0];
  assert.equal(saved.runCount, 1);
  assert.equal((await workflows.listAssistantRuns(actor)).length, 1);
  let run = await workflows.getAssistantRun(actor, saved.lastRunId);
  run = await workflows.controlAssistantRun(actor, run.id, { action: 'pause', revision: run.revision });
  await workflows.controlAssistantRun(actor, run.id, { action: 'resume', revision: run.revision, objective: 'Buscar salones y validar sus necesidades' });
  await routines.dispatchAssistantRoutines(new Date(time.getTime() + 120000));
  saved = (await routines.listAssistantRoutines(actor))[0];
  assert.equal(saved.status, 'running');
  assert.equal((await workflows.getAssistantRun(actor, saved.lastRunId)).steps[0].status, 'completed');
});

test('scheduler stops on revoked access without changing the CRM and emits one actionable notice', async () => {
  const routine = await routines.createAssistantRoutine(actor, { name: 'Radar diario', input: input(), intervalHours: 24, startsAt: new Date(Date.now() + 3600000).toISOString(), maxRuns: 2, requestId: randomUUID() });
  await routines.setAssistantRoutineActive(actor, routine.id, true);
  stores.organizationMembership[0].status = 'inactive';
  await routines.dispatchAssistantRoutines(new Date(Date.now() + 7200000));
  assert.equal(stores.scheduledTrigger[0].status, 'assistant_error');
  assert.equal(stores.microappConfig.filter(row => row.microappId === 'assistant-notification').length, 1);
  assert.equal(stores.lead.length, 1);
  assert.equal(stores.task.length, 0);
});
