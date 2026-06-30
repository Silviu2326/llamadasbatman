import { prisma } from '../lib/prisma'
import bcrypt from 'bcrypt'

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } })
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}
