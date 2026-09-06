/**
 * SECURITY UTILS - JWT, Hashing, Validation
 *
 * Funções de segurança:
 * - Geração e verificação de JWT (jose)
 * - Hash de senhas (Web Crypto API)
 * - Validação de inputs
 * - Sanitização
 */

import { SignJWT, jwtVerify } from 'jose';
import * as bcrypt from 'bcryptjs';
import type { JwtPayload } from '../types';

// ===== JWT TOKENS =====

/**
 * Gera JWT token usando jose
 * Token válido por duração especificada (padrão: 1 hora)
 *
 * @param payload Dados do JWT (sem iat/exp)
 * @param secret Chave secreta
 * @param expiresIn Duração em segundos (padrão: 3600 = 1h)
 */
export async function generateJWT(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: number = 3600,
): Promise<{ token: string; jti: string }> {
  const encoder = new TextEncoder();
  const secretKey = encoder.encode(secret);
  const jti = payload.jti ?? crypto.randomUUID();

  const token = await new SignJWT({ ...payload, jti, sub: String(payload.sub) })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .setJti(jti)
    .sign(secretKey);

  return { token, jti };
}

/**
 * Verifica e decodifica JWT token
 * Retorna payload se válido, null se inválido/expirado
 */
export async function verifyJWT(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const encoder = new TextEncoder();
    const secretKey = encoder.encode(secret);

    const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });

    return payload as unknown as JwtPayload;
  } catch (error) {
    console.error('[JWT] Verification failed:', error);
    return null;
  }
}

/**
 * Extrai token do header Authorization
 * Formato esperado: "Bearer <token>"
 */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.substring(7); // Remove "Bearer "
}

// ===== PASSWORD HASHING =====

/**
 * Hash de senha usando Web Crypto API (SHA-256)
 * Para produção, considere usar bcrypt ou argon2 via npm
 * (Workers não tem bcrypt nativo, precisa de polyfill)
 */
// Função atualizada para usar bcryptjs
export async function hashPassword(password: string): Promise<string> {
  try {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(password, salt);
  } catch (error) {
    console.error('[Security] Erro ao gerar hash de senha:', error);
    throw new Error('Falha na segurança da senha');
  }
}

/**
 * Compara senha com hash bcrypt
 *
 * @param plainPassword Senha em texto claro
 * @param hashedPassword Hash bcrypt da senha (ex: $2a$12$...)
 * @returns true se a senha corresponder ao hash
 */
export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string,
): Promise<boolean> {
  try {
    return bcrypt.compareSync(plainPassword, hashedPassword);
  } catch (error) {
    console.error('[Security] Erro ao verificar senha:', error);
    return false;
  }
}

/**
 * Gera refresh token aleatório (opaco, não JWT)
 *
 * @returns String de 64 caracteres hexadecimais
 */
export function generateRefreshToken(): string {
  // Gerar 32 bytes aleatórios (64 caracteres hex)
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Calcula data de expiração de refresh token
 *
 * @param days Número de dias até expiração (padrão: 7)
 * @returns ISO string da data de expiração
 */
export function getRefreshTokenExpiry(days: number = 7): string {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return now.toISOString();
}

// ===== VALIDATION =====

/**
 * Valida formato de email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Valida CPF brasileiro
 * Remove pontuação e valida dígitos verificadores
 */
export function isValidCPF(cpf: string): boolean {
  if (!cpf) return false;

  // Remove caracteres não numéricos
  const cleanCPF = cpf.replace(/\D/g, '');

  // CPF deve ter 11 dígitos
  if (cleanCPF.length !== 11) {
    return false;
  }

  // Verifica se todos os dígitos são iguais (CPF inválido)
  if (/^(\d)\1+$/.test(cleanCPF)) {
    return false;
  }

  // Validação dos dígitos verificadores
  let sum = 0;
  let remainder: number;

  // Primeiro dígito verificador
  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(9, 10))) return false;

  // Segundo dígito verificador
  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(10, 11))) return false;

  return true;
}

/**
 * Valida se string é data ISO válida
 */
export function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

// ===== SANITIZATION =====

/**
 * Sanitiza string removendo caracteres perigosos
 * Previne XSS básico
 */
export function sanitizeString(input: string): string {
  if (!input) return '';

  return input
    .replace(/[<>'"]/g, '') // Remove caracteres HTML perigosos
    .trim();
}

/**
 * Sanitiza objeto removendo campos undefined/null
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const cleaned: Partial<T> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      cleaned[key as keyof T] = value as T[keyof T];
    }
  }

  return cleaned;
}

/**
 * Gera ID único (UUID v4 simplificado)
 */
export function generateId(): string {
  return crypto.randomUUID();
}
