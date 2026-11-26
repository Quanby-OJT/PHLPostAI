/**
 * CNV-6: draft Knowledge Article templates for Postal ID. They are seeded as
 * drafts with no approved version, so they are never retrieved or quoted.
 * PHLPost replaces every [bracketed] item with approved text and sends each
 * one through KB-1 review before it can answer customers.
 */
export interface PostalIdTemplate {
	title: string
	body: string
}

const NOTE =
	"Draft template. Replace every [bracketed] item with PHLPost-approved text, remove this line, and submit the article for review."

export const POSTAL_ID_TEMPLATES: readonly PostalIdTemplate[] = [
	{
		title: "Postal ID: how to apply (template)",
		body: [
			NOTE,
			"",
			"How to apply for a Postal ID",
			"1. [Where to get the application form, e.g. any capturing post office or the official website]",
			"2. [Documents to prepare: see the requirements article]",
			"3. [Where to submit the form and have the photo, signature and fingerprints captured]",
			"4. [How to pay the fee: see the fees article]",
			"5. [How and when the Postal ID is delivered or claimed]",
			"",
			"PHLPost staff at the capturing site check each application. [How applicants are told about problems with their application]",
		].join("\n"),
	},
	{
		title: "Postal ID: how to renew (template)",
		body: [
			NOTE,
			"",
			"How to renew a Postal ID",
			"1. [When a Postal ID can or must be renewed, and how long it is valid]",
			"2. [Documents to bring, including the current Postal ID]",
			"3. [Where to renew and whether new biometrics are captured]",
			"4. [Renewal fee: see the fees article]",
			"5. [What to do if the Postal ID was lost or damaged]",
		].join("\n"),
	},
	{
		title: "Postal ID: documentary requirements (template)",
		body: [
			NOTE,
			"",
			"Documents needed for a Postal ID",
			"- [The completed application form]",
			"- [Proof of identity: list each accepted document]",
			"- [Proof of address: list each accepted document]",
			"- [Additional documents for minors, foreign residents or name changes, if any]",
			"",
			"[Whether originals, photocopies or both are needed]",
		].join("\n"),
	},
	{
		title: "Postal ID: fees (template)",
		body: [
			NOTE,
			"",
			"Postal ID fees",
			"- [Fee for a new Postal ID, in pesos, and what it includes]",
			"- [Fee for renewal or replacement, in pesos]",
			"- [Delivery fee, if separate]",
			"- [Where and how the fee is paid at the post office]",
			"",
			"[Effective date of these fees]",
		].join("\n"),
	},
	{
		title: "Postal ID: where to apply (template)",
		body: [
			NOTE,
			"",
			"Where to apply for a Postal ID",
			"- [Which post offices are capturing sites, or where the official list is published]",
			"- [Office hours for Postal ID applications]",
			"- [Whether an appointment is needed and how to book one]",
		].join("\n"),
	},
]
