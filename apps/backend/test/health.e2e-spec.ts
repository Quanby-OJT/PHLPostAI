import { ValidationPipe, VersioningType, type INestApplication } from "@nestjs/common"
import { Test, type TestingModule } from "@nestjs/testing"
import request from "supertest"
import { type App } from "supertest/types"

import { AppModule } from "@/app.module"

const API_PREFIX = "api"
const API_VERSION = "1"
const HEALTH_ENDPOINT = `/api/v1/v1/health`

describe("Health (e2e)", () => {
	let app: INestApplication<App>

	const createTestApp = async (): Promise<INestApplication<App>> => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		const nestApp = moduleFixture.createNestApplication()
		nestApp.setGlobalPrefix(API_PREFIX)
		nestApp.enableVersioning({
			type: VersioningType.URI,
			defaultVersion: API_VERSION,
		})
		nestApp.useGlobalPipes(
			new ValidationPipe({
				whitelist: true,
				forbidNonWhitelisted: true,
				transform: true,
			})
		)
		await nestApp.init()
		return nestApp
	}

	const getHealth = () => request(app.getHttpServer()).get(HEALTH_ENDPOINT)

	beforeEach(async () => {
		app = await createTestApp()
	})

	afterEach(async () => {
		await app.close()
	})

	it("returns health status with all checks", async () => {
		const response = await getHealth().expect(200)

		expect(response.body).toMatchObject({
			status: "ok",
			checks: { database: { status: "up" } },
		})
		expect(response.body.timestamp).toBeDefined()
		expect(response.body).not.toHaveProperty("uptime")
		expect(response.body).not.toHaveProperty("version")
		expect(response.body).not.toHaveProperty("environment")
	})

	it("database check is up", async () => {
		const response = await getHealth().expect(200)
		expect(response.body.checks.database.status).toBe("up")
	})

	it("returns only the database dependency check", async () => {
		const response = await getHealth().expect(200)
		expect(response.body.checks).toEqual({ database: { status: "up" } })
	})
})
