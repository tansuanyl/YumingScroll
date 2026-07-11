import { Body, Controller, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { AuthService, type AuthUserRecord } from "../services/AuthService";
import { CurrentUser, Roles } from "./auth.decorators";

const createUserSchema = z.object({
  username: z.string().min(2),
  email: z.string().email().optional(),
  password: z.string().min(6),
  displayName: z.string().optional(),
  role: z.enum(["admin", "tester"]).default("tester"),
  billingMode: z.enum(["free", "coins"]).optional(),
  initialCoins: z.coerce.number().int().nonnegative().optional(),
  note: z.string().optional()
});

const updateUserSchema = z.object({
  password: z.string().min(6).optional(),
  displayName: z.string().optional(),
  role: z.enum(["admin", "tester"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  billingMode: z.enum(["free", "coins"]).optional(),
  coinBalance: z.coerce.number().int().nonnegative().optional(),
  note: z.string().optional()
});

const creditCoinsSchema = z.object({
  coins: z.coerce.number().int().positive(),
  note: z.string().optional()
});

@Roles("admin")
@Controller("api/admin/users")
export class AdminUsersController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  list() {
    return this.auth.listUsers();
  }

  @Get("account-health")
  accountHealth() {
    return this.auth.listAccountHealth();
  }

  @Post()
  create(@Body() body: unknown) {
    return this.auth.createUser(createUserSchema.parse(body));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.auth.updateUser(id, updateUserSchema.parse(body));
  }

  @Post(":id/coins")
  creditCoins(@CurrentUser() user: AuthUserRecord, @Param("id") id: string, @Body() body: unknown) {
    const input = creditCoinsSchema.parse(body);
    return this.auth.creditCoinsManually(id, { ...input, reviewedByUserId: user.id });
  }

  @Post(":id/resend-email-verification")
  resendEmailVerification(@Param("id") id: string) {
    return this.auth.resendEmailVerificationForUser(id);
  }

  @Post(":id/verify-email")
  markEmailVerified(@Param("id") id: string) {
    return this.auth.markEmailVerified(id);
  }
}
