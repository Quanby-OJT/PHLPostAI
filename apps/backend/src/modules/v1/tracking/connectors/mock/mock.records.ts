export interface MockRecord {
	code: string
	text: string
	office: string
	at: string
}

/** Seed data for local testing. "timeout" never answers, to exercise the lookup timeout. */
export const MOCK_RECORDS: Record<string, MockRecord | "timeout"> = {
	RR123456789PH: {
		code: "IN_TRANSIT",
		text: "Item in transit to the destination office",
		office: "Manila Central Post Office",
		at: "18 Nov 2026, 2:32 PM",
	},
	EE987654321PH: {
		code: "OUT_FOR_DELIVERY",
		text: "Out for delivery",
		office: "Quezon City Post Office",
		at: "19 Nov 2026, 8:05 AM",
	},
	CP111222333PH: {
		code: "DELIVERED",
		text: "Delivered",
		office: "Cebu City Post Office",
		at: "17 Nov 2026, 4:10 PM",
	},
	RR000000000PH: "timeout",
}
