import { oc } from "@orpc/contract"

import {
	CustomerChatRequestSchema,
	CustomerChatResultSchema,
	CustomerSessionSchema,
	StartCustomerSessionRequestSchema,
} from "./customer.schema.js"

/**
 * Public customer chat contract (conversation epic, CNV-1, Flow A).
 *
 * These are the only PUBLIC routes in v1: they carry no permission key and
 * authenticate with a Customer Session token in `x-customer-session`, not a
 * staff session. A missing, unknown, or idle-expired token is a 401 (AC5).
 *
 * The streaming sibling (`POST /v1/customer/chat/stream`, SSE) is a plain Nest
 * route rather than a contract route, for the same reason as the staff stream
 * and the corpus upload: oRPC is JSON-only (Tech Plan §5, D3).
 */
export const customerContract = {
	session: {
		start: oc
			.route({
				method: "POST",
				path: "/customer/session",
				summary: "Start an anonymous chat session",
				description:
					"Opens a Customer Session and returns its token once. The session carries no name, email, or phone, and lapses after a period of inactivity.",
				tags: ["Customer"],
			})
			.input(StartCustomerSessionRequestSchema)
			.output(CustomerSessionSchema),
	},
	chat: {
		send: oc
			.route({
				method: "POST",
				path: "/customer/chat/message",
				summary: "Ask a question (non-streamed)",
				description:
					'Answers from APPROVED knowledge articles only, naming the articles used. A question no approved content covers returns the grounded "I don\'t have that information" and invents nothing. Personal data in the question is masked before it is stored or traced.',
				tags: ["Customer"],
			})
			.input(CustomerChatRequestSchema)
			.output(CustomerChatResultSchema),
	},
}
