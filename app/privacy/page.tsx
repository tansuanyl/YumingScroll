import type { Metadata } from "next";
import { PrivacyPolicy } from "../../src/components/PrivacyPolicy";

export const metadata: Metadata = {
  title: "Privacy Policy | 喻鸣绘卷 / Yuming Scroll",
  description: "How Yuming Scroll handles creative data, third-party AI services, and data deletion."
};

export default function PrivacyPage() {
  return <PrivacyPolicy />;
}
