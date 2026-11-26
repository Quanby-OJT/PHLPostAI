"use client"

import { useRef, useState, type FormEvent } from "react"

import type { CustomerLanguage, ScamReportReceipt } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"

import { sendScamReport } from "../api/assistant.client"

const copy = {
	en: {
		report: "Report to PHLPost",
		prompt: "Send the masked submission and assessment to PHLPost for staff review?",
		agent: "I also want to speak to a person",
		send: "Send report",
		cancel: "Cancel",
		sending: "Sending report…",
		received: "PHLPost received your report for review.",
		reference: "Report reference",
		failed: "The report could not be sent. Check your connection and try again.",
		session: "This chat session is unavailable. Start a new chat and check the message again.",
	},
	fil: {
		report: "I-report sa PHLPost",
		prompt:
			"Ipadala sa PHLPost ang mensaheng may tinakpang personal na datos at ang pagsusuri para marepaso ng kawani?",
		agent: "Gusto ko ring makipag-usap sa isang kawani",
		send: "Ipadala ang report",
		cancel: "Kanselahin",
		sending: "Ipinapadala ang report…",
		received: "Natanggap ng PHLPost ang report para sa pagrepaso.",
		reference: "Reference ng report",
		failed: "Hindi naipadala ang report. Tingnan ang koneksyon at subukang muli.",
		session:
			"Hindi na magagamit ang chat na ito. Magsimula ng bagong chat at suriin muli ang mensahe.",
	},
	ceb: {
		report: "Ireport sa PHLPost",
		prompt:
			"Ipadala sa PHLPost ang mensahe nga gitabonan ang personal nga datos ug ang pagsusi aron marepaso sa kawani?",
		agent: "Gusto usab kong makigsulti sa kawani",
		send: "Ipadala ang report",
		cancel: "Kanselahon",
		sending: "Gipadala ang report…",
		received: "Nadawat sa PHLPost ang report aron marepaso.",
		reference: "Reperensiya sa report",
		failed: "Wala mapadala ang report. Susiha ang koneksiyon ug sulayi pag-usab.",
		session:
			"Dili na magamit kini nga chat. Sugdi ang bag-ong chat ug susiha pag-usab ang mensahe.",
	},
	ilo: {
		report: "Ireport iti PHLPost",
		prompt:
			"Ipatulod iti PHLPost ti mensahe a nailimed ti personal a datosna ken ti panangsukimat tapno marepaso dagiti empleado?",
		agent: "Kayatko met ti makisao iti empleado",
		send: "Ipaw-it ti report",
		cancel: "Kanselaen",
		sending: "Maipaw-it ti report…",
		received: "Naawat ti PHLPost ti report para iti panangrepaso.",
		reference: "Reperensia ti report",
		failed: "Saan a naipaw-it ti report. Kitaen ti koneksion ken padasen manen.",
		session:
			"Saanen a magusar daytoy a chat. Mangrugi iti baro a chat ken sukimaten manen ti mensahe.",
	},
} satisfies Record<CustomerLanguage, Record<string, string>>

export function ScamReportAction({
	submissionId,
	language,
	receipt,
	canRequestAgent,
	onReported,
	getToken,
}: {
	submissionId: string
	language: CustomerLanguage
	receipt?: ScamReportReceipt
	canRequestAgent: boolean
	onReported: (receipt: ScamReportReceipt) => void
	getToken: () => string | undefined
}) {
	const strings = copy[language]
	const [confirm, setConfirm] = useState(false)
	const [requestAgent, setRequestAgent] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string>()
	const pending = useRef(false)

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (pending.current || receipt) return
		const token = getToken()
		if (!token) {
			setError(strings.session)
			return
		}
		pending.current = true
		setBusy(true)
		setError(undefined)
		try {
			onReported(await sendScamReport(submissionId, canRequestAgent && requestAgent, token))
		} catch (failure) {
			setError(
				failure instanceof ApiError && failure.status === 401 ? strings.session : strings.failed
			)
		} finally {
			pending.current = false
			setBusy(false)
		}
	}

	return (
		<div className="mt-3 space-y-2 border-t pt-2">
			{receipt ? (
				<div role="status">
					<p>{strings.received}</p>
					<p>
						{strings.reference} <strong className="break-all">{receipt.reference}</strong>
					</p>
				</div>
			) : confirm ? (
				<form onSubmit={submit} className="space-y-2">
					<p>{strings.prompt}</p>
					{canRequestAgent && (
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={requestAgent}
								disabled={busy}
								onChange={event => setRequestAgent(event.target.checked)}
							/>
							{strings.agent}
						</label>
					)}
					<div className="flex flex-wrap gap-2">
						<button
							type="submit"
							disabled={busy}
							className="bg-primary text-primary-foreground min-h-10 rounded px-3 disabled:opacity-50"
						>
							{busy ? strings.sending : strings.send}
						</button>
						<button
							type="button"
							disabled={busy}
							className="min-h-10 px-2 underline"
							onClick={() => {
								setConfirm(false)
								setError(undefined)
								setRequestAgent(false)
							}}
						>
							{strings.cancel}
						</button>
					</div>
				</form>
			) : (
				<button
					type="button"
					className="min-h-9 font-medium underline underline-offset-2"
					onClick={() => setConfirm(true)}
				>
					{strings.report}
				</button>
			)}
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
		</div>
	)
}
