import { z } from "zod"

export const ChannelConfigSchema = z.object({
	allowedOrigins: z.array(z.string()),
	welcomeText: z.string(),
})

export const ChannelSchema = z.object({
	code: z.string(),
	name: z.string(),
	isEnabled: z.boolean(),
	config: ChannelConfigSchema,
	updatedAt: z.coerce.date(),
})

export const UpdateChannelSchema = z
	.object({
		code: z.string().min(1),
		isEnabled: z.boolean().optional(),
		allowedOrigins: z.array(z.string().url()).max(100).optional(),
		welcomeText: z.string().trim().max(1000).optional(),
	})
	.refine(
		value =>
			value.isEnabled !== undefined ||
			value.allowedOrigins !== undefined ||
			value.welcomeText !== undefined,
		"At least one channel setting must be changed"
	)

export type Channel = z.infer<typeof ChannelSchema>
export type UpdateChannel = z.infer<typeof UpdateChannelSchema>
