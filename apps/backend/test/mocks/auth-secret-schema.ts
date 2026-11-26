import { z } from "zod"

export const AUTH_SECRET_MIN_LENGTH = 32
export const PLACEHOLDER_SECRET_PREFIXES: readonly string[] = []
export const authSecretSchema = z.string().min(AUTH_SECRET_MIN_LENGTH)
export const isPlaceholderSecret = () => false
