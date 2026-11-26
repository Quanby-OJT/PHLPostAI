import type { PostalIdIntent } from "./postal-id-guidance"

/**
 * CNV-6 evaluation set for Postal ID questions. Status questions must get the
 * fixed no-records reply, eligibility questions the published requirements plus
 * the "can't decide your case" notice, and the rest ordinary guidance.
 */
export const POSTAL_ID_QUESTIONS: ReadonlyArray<{ question: string; intent: PostalIdIntent }> = [
	{ question: "How do I apply for a Postal ID?", intent: "guidance" },
	{ question: "How do I renew my Postal ID?", intent: "guidance" },
	{ question: "What are the requirements for postal id", intent: "guidance" },
	{ question: "How much is the Postal ID fee?", intent: "guidance" },
	{ question: "Where can I get a Postal ID?", intent: "guidance" },
	{ question: "How long does it take to get a Postal ID?", intent: "guidance" },
	{ question: "Paano mag-renew ng Postal ID?", intent: "guidance" },
	{ question: "Am I eligible for a Postal ID?", intent: "eligibility" },
	{ question: "Will my application be approved?", intent: "eligibility" },
	{ question: "I'm 17, am I qualified for a Postal ID?", intent: "eligibility" },
	{ question: "Will I be approved if I only have a barangay clearance?", intent: "eligibility" },
	{ question: "Eligible ba ako sa Postal ID?", intent: "eligibility" },
	{ question: "Maaaprubahan ba ang aplikasyon ko?", intent: "eligibility" },
	{ question: "Kwalipikado ba ko sa Postal ID?", intent: "eligibility" },
	{ question: "What is the status of my Postal ID application?", intent: "status" },
	{ question: "Where is my Postal ID?", intent: "status" },
	{ question: "Is my postal ID ready?", intent: "status" },
	{ question: "Nasaan na ang Postal ID ko?", intent: "status" },
	{ question: "Kumusta na ang aplikasyon ko?", intent: "status" },
	{ question: "Asa na akong Postal ID?", intent: "status" },
]
