import { expect, test, type BrowserContext, type Route } from "@playwright/test"

const ORIGIN = "http://127.0.0.1:3021"
const API = "http://127.0.0.1:3020/api/v1"
const SAMPLE =
	"PHLPost delivery notice for Juan Test. Contact 09170000000 or juan.test@example.com. Pay PHP 50 at https://fake-postal-delivery.example/pay. Reference https://phlpost.gov.ph/guide."

async function signIn(context: BrowserContext, email: string) {
	const response = await context.request.post(API + "/auth/sign-in/email", {
		headers: { origin: ORIGIN },
		data: { email, password: process.env.SCM3_QA_PASSWORD },
	})
	expect(response.status()).toBe(200)
}

test.describe("SCM-3 customer reporting and staff review", () => {
	test.skip(process.env.SCM3_BROWSER_QA !== "1", "Requires the isolated SCM-3 QA stack")
	test.use({ serviceWorkers: "block" })

	for (const width of [1280, 390]) {
		test(`reports from the ${width}px widget and reads the masked evidence as staff`, async ({
			page,
			browser,
		}, testInfo) => {
			test.setTimeout(45_000)
			await page.setViewportSize({ width, height: 844 })
			const unsafeRequests: string[] = []
			function onlyLocal(route: Route) {
				const url = new URL(route.request().url())
				if (["fake-postal-delivery.example", "phlpost.gov.ph"].includes(url.hostname)) {
					unsafeRequests.push(url.hostname)
				}
				return url.hostname === "127.0.0.1" ? route.continue() : route.abort()
			}
			await page.route("**/*", onlyLocal)
			await page.goto(ORIGIN + "/assistant")
			await page.getByRole("button", { name: "I understand, start chat" }).click()
			await page.getByRole("button", { name: "Check a suspicious message" }).click()
			await page.getByRole("textbox", { name: "Paste the message, email, or link" }).fill(SAMPLE)
			await page.getByRole("button", { name: "Check message", exact: true }).click()
			await expect(page.getByRole("log")).toContainText("Assessed risk: High")
			const report = page.getByRole("button", { name: "Report to PHLPost" })
			await report.click()
			await page.getByRole("button", { name: "Cancel" }).click()
			await expect(report).toBeVisible()
			await report.click()
			if (width === 1280) await page.getByLabel("I also want to speak to a person").check()
			const response = page.waitForResponse(
				candidate =>
					candidate.url() === API + "/customer/scam-reports" &&
					candidate.request().method() === "POST"
			)
			await page.getByRole("button", { name: "Send report", exact: true }).click()
			const sent = await response
			expect(sent.status()).toBe(200)
			const { reference } = (await sent.json()) as { reference: string }
			const receipt = page.getByText(reference, { exact: true })
			await expect(receipt).toBeInViewport()
			await expect(page.getByRole("log")).toContainText("received your report for review")
			await expect(page.getByRole("log")).toContainText("conclusive determinations of fraud")
			await expect(page.getByRole("log")).not.toContainText("Juan Test")
			await page.reload()
			await expect(receipt).toBeInViewport()
			await page.screenshot({ path: testInfo.outputPath("widget-receipt.png") })
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				width
			)
			expect(unsafeRequests).toEqual([])

			const staff = await browser.newContext({
				viewport: { width, height: 844 },
				serviceWorkers: "block",
			})
			try {
				await staff.route("**/*", onlyLocal)
				await signIn(
					staff,
					width === 1280 ? "scm3.reviewer@example.test" : "scm3.reader@example.test"
				)
				const detail = await staff.newPage()
				await detail.goto(ORIGIN + "/scam-reports")
				const reportLink = detail.getByRole("link", { name: reference })
				const nextPage = detail.getByRole("button", { name: "Next", exact: true })
				await expect(detail.getByRole("table")).toBeVisible()
				while (
					!(await reportLink.isVisible()) &&
					(await nextPage.isVisible()) &&
					(await nextPage.isEnabled())
				) {
					await nextPage.click()
					await expect(detail.getByRole("table")).toBeVisible()
				}
				await reportLink.click()
				const evidence = detail.getByRole("region", { name: "Masked submission" })
				await expect(evidence).toContainText("[PHONE]")
				await expect(evidence).toContainText("[EMAIL]")
				await expect(evidence).toContainText("[NAME]")
				await expect(evidence).toContainText("[UNOFFICIAL_URL]")
				await expect(evidence.getByText("https://phlpost.gov.ph", { exact: true })).toBeVisible()
				await expect(evidence.getByRole("link")).toHaveCount(0)
				await expect(evidence.locator("iframe, img")).toHaveCount(0)
				await expect(evidence).not.toContainText("fake-postal-delivery.example")
				if (width === 1280) {
					await detail.getByRole("button", { name: "Start review" }).click()
					await detail
						.getByRole("combobox", { name: "Finding", exact: true })
						.selectOption("confirmed_scam", { timeout: 8_000 })
					await detail.getByLabel("Reviewer notes").fill("Reviewed synthetic browser evidence.")
					await detail.getByRole("button", { name: "Save finding" }).click()
					await expect(
						detail.getByText("Reviewed synthetic browser evidence.", { exact: true })
					).toBeVisible()
				} else {
					await expect(detail.getByText("You have read-only access.")).toBeVisible()
					await expect(
						detail.getByRole("button", { name: /start review|save finding|close report/i })
					).toHaveCount(0)
				}
				expect(unsafeRequests).toEqual([])
				await detail.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
				await detail.screenshot({ path: testInfo.outputPath("staff-evidence.png"), fullPage: true })
			} finally {
				await staff.close()
			}
		})
	}
})
