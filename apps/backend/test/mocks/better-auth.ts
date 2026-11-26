import { SetMetadata } from "@nestjs/common"

export class AuthModule {
	static forRoot() {
		return { module: AuthModule }
	}
}

export class AuthGuard {
	canActivate() {
		return true
	}
}

export const AllowAnonymous = () => SetMetadata("PUBLIC", true)
export const Session = () => () => undefined
