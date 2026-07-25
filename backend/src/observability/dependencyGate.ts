export type DependencyName = 'DATABASE_URL' | 'REDIS_URL'

export type DependencyCheck = {
  name: DependencyName
  required: boolean
  configured: boolean
  status: 'ready' | 'missing' | 'disabled'
  remediation: string
}

export type DependencyGateResult = {
  ok: boolean
  checks: DependencyCheck[]
  missing: DependencyName[]
  message: string
}

function present(environment: NodeJS.ProcessEnv, name: DependencyName): boolean {
  return Boolean(environment[name]?.trim())
}

export function checkRuntimeDependencies(environment: NodeJS.ProcessEnv = process.env): DependencyGateResult {
  const redisRequired = environment.BACKGROUND_WORKERS_ENABLED !== 'false'
  const checks: DependencyCheck[] = [
    {
      name: 'DATABASE_URL',
      required: true,
      configured: present(environment, 'DATABASE_URL'),
      status: present(environment, 'DATABASE_URL') ? 'ready' : 'missing',
      remediation: 'Define DATABASE_URL con una base PostgreSQL aislada del entorno local antes de ejecutar staging.',
    },
    {
      name: 'REDIS_URL',
      required: redisRequired,
      configured: present(environment, 'REDIS_URL'),
      status: !redisRequired ? 'disabled' : present(environment, 'REDIS_URL') ? 'ready' : 'missing',
      remediation: 'Define REDIS_URL y verifica conectividad; los workers y reintentos dependen de Redis.',
    },
  ]
  const missing = checks.filter(check => check.required && !check.configured).map(check => check.name)
  const message = missing.length === 0
    ? 'Prerrequisitos de runtime presentes: DATABASE_URL y Redis están configurados.'
    : [
        'No se puede ejecutar QA de staging: faltan dependencias obligatorias.',
        ...checks.filter(check => missing.includes(check.name)).map(check => `- ${check.name}: ${check.remediation}`),
        'La prueba qa:smoke sí puede ejecutarse sin credenciales ni servicios externos.',
      ].join('\n')
  return { ok: missing.length === 0, checks, missing, message }
}

export function formatDependencyGateFailure(result: DependencyGateResult): string {
  return result.ok ? '' : `${result.message}\nConfigura los valores en backend/.env o en el gestor de secretos del despliegue y vuelve a ejecutar el gate.`
}
