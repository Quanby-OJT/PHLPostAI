import type { RateEntryUi } from "@/features/rates/api/rates.hooks"
import { formatDates, formatPrice, formatWeightBand } from "@/features/rates/lib/format"

type RateRow = Pick<
	RateEntryUi,
	| "serviceCode"
	| "serviceName"
	| "zone"
	| "weightMinG"
	| "weightMaxG"
	| "priceCentavos"
	| "effectiveFrom"
	| "effectiveTo"
> & { key: string }

export function RateTable({ rows, label }: { rows: RateRow[]; label: string }) {
	return (
		<div className="overflow-x-auto rounded-md border">
			<table className="w-full text-sm" aria-label={label}>
				<thead className="bg-muted/50 text-left">
					<tr>
						<th className="px-3 py-2 font-medium">Service</th>
						<th className="px-3 py-2 font-medium">Zone</th>
						<th className="px-3 py-2 font-medium">Weight</th>
						<th className="px-3 py-2 text-right font-medium">Price</th>
						<th className="px-3 py-2 font-medium">Effective</th>
					</tr>
				</thead>
				<tbody>
					{rows.map(row => (
						<tr key={row.key} className="border-t">
							<td className="px-3 py-2">
								{row.serviceName}
								<span className="text-muted-foreground block font-mono text-xs">
									{row.serviceCode}
								</span>
							</td>
							<td className="px-3 py-2">{row.zone}</td>
							<td className="px-3 py-2">{formatWeightBand(row.weightMinG, row.weightMaxG)}</td>
							<td className="px-3 py-2 text-right tabular-nums">
								{formatPrice(row.priceCentavos)}
							</td>
							<td className="px-3 py-2">{formatDates(row.effectiveFrom, row.effectiveTo)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
