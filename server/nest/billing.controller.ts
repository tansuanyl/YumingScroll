import { Body, Controller, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { AuthService, type AuthUserRecord } from "../services/AuthService";
import { CurrentUser, Roles } from "./auth.decorators";

const rechargeRequestSchema = z.object({
  paymentMethod: z.enum(["wechat", "alipay"]),
  amountCny: z.coerce.number().int().positive(),
  note: z.string().optional()
});

const reviewSchema = z.object({
  status: z.enum(["approved", "rejected"])
});

const completePasswordResetSchema = z.object({
  password: z.string().min(6)
});

@Controller("api/billing")
export class BillingController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("me")
  me(@CurrentUser() user: AuthUserRecord) {
    return this.auth.getBillingStatus(user.id);
  }

  @Post("recharge-requests")
  createRechargeRequest(@CurrentUser() user: AuthUserRecord, @Body() body: unknown) {
    return this.auth.createRechargeRequest(user.id, rechargeRequestSchema.parse(body));
  }

  @Roles("admin")
  @Get("admin/recharge-requests")
  listRechargeRequests() {
    return this.auth.listRechargeRequests();
  }

  @Roles("admin")
  @Patch("admin/recharge-requests/:id")
  reviewRechargeRequest(@CurrentUser() user: AuthUserRecord, @Param("id") id: string, @Body() body: unknown) {
    const input = reviewSchema.parse(body);
    return input.status === "approved"
      ? this.auth.approveRechargeRequest(id, user.id)
      : this.auth.rejectRechargeRequest(id, user.id);
  }

  @Roles("admin")
  @Get("admin/password-reset-requests")
  listPasswordResetRequests() {
    return this.auth.listPasswordResetRequests();
  }

  @Roles("admin")
  @Patch("admin/password-reset-requests/:id")
  completePasswordResetRequest(@CurrentUser() user: AuthUserRecord, @Param("id") id: string, @Body() body: unknown) {
    const input = completePasswordResetSchema.parse(body);
    return this.auth.completePasswordResetRequest(id, { password: input.password, reviewedByUserId: user.id });
  }
}
