/**
 * PHLPost postal terms glossary seed (CNV-4).
 * Official PHLPost terms, services, and identifiers that must remain
 * untranslated when translating queries or generating replies in
 * English, Filipino, Cebuano, or Ilocano.
 */
export interface PostalGlossaryTerm {
	term: string
	category: "service" | "identity" | "fee" | "tracking" | "organization"
	preserveExact: boolean
	notes?: string
}

export const PHLPOST_GLOSSARY_SEED: readonly PostalGlossaryTerm[] = [
	{ term: "PHLPost", category: "organization", preserveExact: true, notes: "Philippine Postal Corporation" },
	{ term: "Postal ID", category: "identity", preserveExact: true, notes: "Official Philippine Postal ID card" },
	{ term: "Express Mail Service", category: "service", preserveExact: true, notes: "EMS" },
	{ term: "EMS", category: "service", preserveExact: true, notes: "Express Mail Service" },
	{ term: "Registered Mail", category: "service", preserveExact: true },
	{ term: "Ordinary Mail", category: "service", preserveExact: true },
	{ term: "Parcel Post", category: "service", preserveExact: true },
	{ term: "Franking Machine", category: "fee", preserveExact: true },
	{ term: "Postage Stamp", category: "fee", preserveExact: true },
	{ term: "Philatelic", category: "service", preserveExact: true },
	{ term: "Post Office", category: "organization", preserveExact: true },
	{ term: "Tracking Number", category: "tracking", preserveExact: true },
	{ term: "Waybill", category: "tracking", preserveExact: true },
	{ term: "Customs Declaration", category: "tracking", preserveExact: true },
] as const

export const UNTRANSLATED_POSTAL_TERMS: readonly string[] = PHLPOST_GLOSSARY_SEED
	.filter((item) => item.preserveExact)
	.map((item) => item.term)
