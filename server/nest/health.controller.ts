import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth.decorators";

@Controller("api")
export class HealthController {
  @Public()
  @Get("health")
  health() {
    return { ok: true };
  }
}
