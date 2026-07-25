#!/usr/bin/env node

/**
 * Runner único de tests de backend.
 *
 * Carga .env en el proceso padre, valida el aislamiento y sólo entonces
 * arranca Node --test. Así NODE_ENV y DATABASE_URL ya están fijados cuando
 * ESM/tsx evalúa src/lib/prisma.ts y cualquier middleware de autenticación.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(scriptDir, '..')
const testRoot = path.join(backendRoot, 'src', '__tests__')

function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed)
  if (!match) return null
  let value = match[2].trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return [match[1], value]
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return
  // Node 20.12+ provides the same parser semantics as --env-file. The
  // fallback keeps the runner usable on older CI images without a dependency.
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(file)
    return
  }
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const parsed = parseEnvLine(line)
    if (parsed && process.env[parsed[0]] === undefined) process.env[parsed[0]] = parsed[1]
  }
}

function collectTestFiles(directory) {
  if (!fs.existsSync(directory)) return []
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...collectTestFiles(absolute))
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) files.push(absolute)
  }
  return files.sort((a, b) => a.localeCompare(b)).map((file) => path.relative(backendRoot, file))
}

loadEnvFile(path.join(backendRoot, '.env'))

// Dynamic import is intentional: the guard reads the environment only after
// .env has been loaded, and no application module is imported by this runner.
const { validateTestDatabaseEnvironment } = await import('./test-database-guard.mjs')
let validation
try {
  validation = validateTestDatabaseEnvironment(process.env)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Configuración de tests inválida.')
  process.exitCode = 1
  process.exit()
}

const testFiles = collectTestFiles(testRoot)
if (!testFiles.length) {
  console.error('No se encontraron archivos src/__tests__/**/*.test.ts.')
  process.exitCode = 1
  process.exit()
}

if (process.argv.includes('--list')) {
  console.log(testFiles.join('\n'))
  process.exit(0)
}

const childEnv = {
  ...process.env,
  NODE_ENV: 'test',
  VENDRAVA_TEST_MODE: '1',
  // Defensa adicional: el proceso hijo no puede inicializar Prisma con la
  // URL de aplicación aunque un módulo se importe antes que testHelpers.ts.
  DATABASE_URL: process.env.TEST_DATABASE_URL,
}

const child = spawn(process.execPath, ['--import=tsx', '--test', ...testFiles], {
  cwd: backendRoot,
  env: childEnv,
  stdio: 'inherit',
  windowsHide: true,
})

child.on('error', (error) => {
  console.error(`No se pudo iniciar la suite de tests: ${error.message}`)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  // Keep the validation referenced so a future refactor cannot accidentally
  // remove the isolation check before the child is started.
  void validation
  process.exitCode = typeof code === 'number' ? code : 1
  if (signal) console.error(`La suite terminó por la señal ${signal}.`)
})
